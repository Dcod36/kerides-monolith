import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { BookingRepository } from '../repositories/booking.repository';
import { RideRequestRepository } from '../repositories/ride-request.repository';
import { FareService } from './fare.service';
import { OtpService } from './otp.service';
import { NotificationService } from './notification.service';
import { MatchingService } from './matching.service';
import { DriverContactService } from './driver-contact.service';
import { UserContactService } from './user-contact.service';
import { BookingStatus } from '../schemas/booking.schema';
import { RideRequestStatus } from '../schemas/ride-request.schema';
import { CreateBookingDto } from '../dto/create-booking.dto';
import { UpdateBookingStatusDto } from '../dto/update-booking-status.dto';
import { VerifyOtpDto } from '../dto/verify-otp.dto';
import { EstimateFareDto } from '../dto/estimate-fare.dto';
import { FindNearbyDriversDto } from '../dto/find-nearby-drivers.dto';
import { RateBookingDto } from '../dto/rate-booking.dto';
import { addMinutes } from '../utils/date.util';

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);
  private readonly bookingExpiryMinutes = parseInt(
    process.env.BOOKING_EXPIRY_MINUTES || '3',
    10,
  );
  private readonly preRideOtpTimeoutMinutes = parseInt(
    process.env.PRE_RIDE_OTP_TIMEOUT_MINUTES || '12',
    10,
  );
  private readonly enableDriverRideEmails =
    String(process.env.ENABLE_DRIVER_RIDE_EMAILS || 'false').toLowerCase() ===
    'true';

  constructor(
    private readonly bookingRepo: BookingRepository,
    private readonly rideRequestRepo: RideRequestRepository,
    private readonly fareService: FareService,
    private readonly otpService: OtpService,
    private readonly notificationService: NotificationService,
    private readonly matchingService: MatchingService,
    private readonly driverContactService: DriverContactService,
    private readonly userContactService: UserContactService,
  ) {}

  private defaultVehicleInfo() {
    return {
      vehicleType: '',
      make: '',
      model: '',
      licensePlate: '',
      color: '',
    };
  }

  private sanitizeDriverPayload(driver: any) {
    if (!driver) return undefined;

    const vehicle = driver.vehicle || {};
    return {
      accountId: String(driver.accountId || ''),
      fullName: String(driver.fullName || ''),
      phoneNumber: String(driver.phoneNumber || ''),
      email: String(driver.email || ''),
      vehicle: {
        vehicleType: String(vehicle.vehicleType || vehicle.type || ''),
        make: String(vehicle.make || ''),
        model: String(vehicle.model || vehicle.vehicleModel || ''),
        licensePlate: String(vehicle.licensePlate || vehicle.registrationNumber || ''),
        color: String(vehicle.color || ''),
      },
    };
  }

  private sanitizeUserPayload(user: any) {
    if (!user) return undefined;
    return {
      accountId: String(user.accountId || ''),
      fullName: String(user.fullName || ''),
      phoneNumber: String(user.phoneNumber || ''),
      email: String(user.email || ''),
    };
  }

  private sanitizeBookingResponse(booking: any): any {
    const output = booking?.toObject ? booking.toObject() : { ...(booking || {}) };

    output.driver = this.sanitizeDriverPayload(output.driver) || {
      accountId: '',
      fullName: '',
      phoneNumber: '',
      email: '',
      vehicle: this.defaultVehicleInfo(),
    };

    if (!output.driver.vehicle) {
      output.driver.vehicle = this.defaultVehicleInfo();
    }

    output.driver.vehicle = {
      ...this.defaultVehicleInfo(),
      ...output.driver.vehicle,
    };

    output.user = this.sanitizeUserPayload(output.user) || {
      accountId: '',
      fullName: '',
      phoneNumber: '',
      email: '',
    };

    return output;
  }

  private async preloadContactCaches(
    bookings: any[],
    driverCache: Map<string, any>,
    userCache: Map<string, any>,
  ): Promise<void> {
    const driverIds = Array.from(
      new Set(
        bookings
          .map((b) => String(b?.driverId || '').trim())
          .filter((id) => Types.ObjectId.isValid(id)),
      ),
    );
    const userIds = Array.from(
      new Set(
        bookings
          .map((b) => String(b?.userId || '').trim())
          .filter((id) => Types.ObjectId.isValid(id)),
      ),
    );

    await Promise.all([
      Promise.all(
        driverIds.map(async (id) => {
          if (driverCache.has(id)) return;
          try {
            const contact = await this.driverContactService.resolveDriverContact(id);
            driverCache.set(id, contact || null);
          } catch {
            driverCache.set(id, null);
          }
        }),
      ),
      Promise.all(
        userIds.map(async (id) => {
          if (userCache.has(id)) return;
          try {
            const contact = await this.userContactService.resolveUserContact(id);
            userCache.set(id, contact || null);
          } catch {
            userCache.set(id, null);
          }
        }),
      ),
    ]);
  }

  private getPreRideTimeoutMs(): number {
    return Math.max(1, this.preRideOtpTimeoutMinutes) * 60 * 1000;
  }

  private isPreRideOtpExpired(booking: any, now: number = Date.now()): boolean {
    if (!booking) {
      return false;
    }

    if (
      booking.status !== BookingStatus.ACCEPTED &&
      booking.status !== BookingStatus.DRIVER_ARRIVED
    ) {
      return false;
    }

    if (booking.otpVerifiedAt) {
      return false;
    }

    const startedAt =
      booking.driverArrivedAt ||
      booking.acceptedAt ||
      booking.updatedAt ||
      booking.createdAt;

    if (!startedAt) {
      return false;
    }

    return now - new Date(startedAt).getTime() >= this.getPreRideTimeoutMs();
  }

  private async autoCancelExpiredPreRideBooking(
    booking: any,
    reason?: string,
  ): Promise<boolean> {
    if (!booking || !this.isPreRideOtpExpired(booking)) {
      return false;
    }

    const cancelReason =
      reason ||
      `Auto-cancelled: OTP not verified within ${this.preRideOtpTimeoutMinutes} minutes`;

    await this.bookingRepo.updateStatus(booking._id, BookingStatus.CANCELLED, {
      cancelReason,
      cancelledBy: 'SYSTEM',
      cancelledAt: new Date(),
    });

    await this.rideRequestRepo.expireBookingRequests(booking._id.toString());
    await this.sendUserCancellationNotification(booking, cancelReason);

    this.logger.warn(
      `Auto-cancelled stale pre-ride booking ${booking._id} for driver ${booking.driverId}`,
    );

    return true;
  }

  private async hasActiveBooking(driverAccountId: string): Promise<boolean> {
    const driverBookings = await this.bookingRepo.findByDriverId(driverAccountId);
    const activeBookings = driverBookings.filter((booking) =>
      this.isDriverActiveStatus(booking.status),
    );

    let activeCount = 0;
    for (const booking of activeBookings) {
      const cancelled = await this.autoCancelExpiredPreRideBooking(booking);
      if (!cancelled) {
        activeCount += 1;
      }
    }

    return activeCount > 0;
  }

  private async pickFirstFreeDriver<T extends { accountId: string }>(
    drivers: T[],
  ): Promise<T | null> {
    for (const driver of drivers) {
      if (!(await this.hasActiveBooking(String(driver.accountId)))) {
        return driver;
      }
      this.logger.warn(
        `Skipping driver ${driver.accountId} because they already have an active booking`,
      );
    }
    return null;
  }

  private isDriverActiveStatus(status?: BookingStatus | string): boolean {
    const value = String(status || '').toUpperCase();
    return (
      value === BookingStatus.ACCEPTED ||
      value === BookingStatus.DRIVER_ARRIVED ||
      value === BookingStatus.IN_PROGRESS
    );
  }

  private async enforceSingleActiveBookingForDriver(driverId: string): Promise<void> {
    const allDriverBookings = await this.bookingRepo.findByDriverId(driverId);
    const activeBookings = allDriverBookings
      .filter((booking) => this.isDriverActiveStatus(booking.status))
      .sort((a: any, b: any) => {
        const aTs = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
        const bTs = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
        return bTs - aTs;
      });

    if (activeBookings.length <= 1) {
      return;
    }

    const toCancel = activeBookings.slice(1);
    for (const duplicate of toCancel) {
      await this.bookingRepo.updateStatus(duplicate._id, BookingStatus.CANCELLED, {
        cancelReason: 'System cleanup: duplicate active booking for same driver',
        cancelledBy: 'SYSTEM',
        cancelledAt: new Date(),
      });
    }

    this.logger.warn(
      `Auto-cleaned ${toCancel.length} duplicate active booking(s) for driver ${driverId}`,
    );
  }

  /**
   * Create a new booking
   */
  async createBooking(
    userId: string,
    createBookingDto: CreateBookingDto,
    authHeader?: string,
  ): Promise<any> {
    try {
      // Calculate fare
      const fareResult = await this.fareService.calculateFare({
        distanceInMeters: createBookingDto.distance.value,
        durationInSeconds: createBookingDto.duration.value,
        vehicleId: createBookingDto.vehicleId,
        vehicleType: createBookingDto.vehicleType || 'SEDAN',
      });

      // Create booking record
      const booking = await this.bookingRepo.create({
        userId: new Types.ObjectId(userId),
        driverId: createBookingDto.driverId && Types.ObjectId.isValid(createBookingDto.driverId)
          ? new Types.ObjectId(createBookingDto.driverId)
          : null,
        vehicleId: createBookingDto.vehicleId && Types.ObjectId.isValid(createBookingDto.vehicleId)
          ? new Types.ObjectId(createBookingDto.vehicleId)
          : null,
        vehicleType: createBookingDto.vehicleType || null,
        origin: createBookingDto.origin,
        destination: createBookingDto.destination,
        distance: createBookingDto.distance,
        duration: createBookingDto.duration,
        fare: fareResult.estimatedFare,
        fareBreakdown: fareResult.fareBreakdown,
        status: BookingStatus.PENDING,
        paymentMethod: createBookingDto.paymentMethod,
        scheduledAt: createBookingDto.scheduledAt
          ? new Date(createBookingDto.scheduledAt)
          : null,
        expiresAt: addMinutes(new Date(), this.bookingExpiryMinutes),
        notes: createBookingDto.notes,
      });

      this.logger.log(`✅ Booking created: ${booking._id}`);

      // Find nearby drivers (sorted by distance)
      const nearbyDrivers = await this.matchingService.findNearbyDrivers(
        createBookingDto.origin.coordinates.lat,
        createBookingDto.origin.coordinates.lng,
        undefined,
        undefined,
        createBookingDto.vehicleType,
      );

      this.logger.log(`Found ${nearbyDrivers.length} nearby drivers`);

      if (nearbyDrivers.length === 0) {
        // No drivers available - auto-cancel booking
        await this.bookingRepo.updateStatus(
          booking._id.toString(),
          BookingStatus.CANCELLED,
          {
            cancelReason: 'No drivers available in your area at this time',
            cancelledBy: 'SYSTEM',
            cancelledAt: new Date(),
          },
        );

        await this.sendUserCancellationNotification(
          booking,
          'No drivers available in your area at this time',
        );

        throw new BadRequestException('No drivers available in your area. Please try again later.');
      }

      // 🎯 If user selected a specific driver, notify that exact driver first.
      // Otherwise fallback to nearest driver.
      let firstDriver = await this.pickFirstFreeDriver(nearbyDrivers);

      if (!firstDriver) {
        await this.bookingRepo.updateStatus(
          booking._id.toString(),
          BookingStatus.CANCELLED,
          {
            cancelReason: 'No free drivers available in your area at this time',
            cancelledBy: 'SYSTEM',
            cancelledAt: new Date(),
          },
        );

        await this.sendUserCancellationNotification(
          booking,
          'No free drivers available in your area at this time',
        );

        throw new BadRequestException('No free drivers available in your area. Please try again later.');
      }
      if (createBookingDto.driverId) {
        const selected = nearbyDrivers.find(
          (driver) => String(driver.accountId) === String(createBookingDto.driverId),
        );

        if (!selected) {
          await this.bookingRepo.updateStatus(
            booking._id.toString(),
            BookingStatus.CANCELLED,
            {
              cancelReason: 'Selected driver is no longer available nearby',
              cancelledBy: 'SYSTEM',
              cancelledAt: new Date(),
            },
          );

          await this.sendUserCancellationNotification(
            booking,
            'Selected driver is no longer available nearby',
          );

          throw new BadRequestException('Selected driver is no longer available. Please choose another driver.');
        }

        if (await this.hasActiveBooking(String(selected.accountId))) {
          await this.bookingRepo.updateStatus(
            booking._id.toString(),
            BookingStatus.CANCELLED,
            {
              cancelReason: 'Selected driver is currently on another ride',
              cancelledBy: 'SYSTEM',
              cancelledAt: new Date(),
            },
          );

          await this.sendUserCancellationNotification(
            booking,
            'Selected driver is currently on another ride',
          );

          throw new BadRequestException('Selected driver is currently on another ride. Please choose another driver.');
        }

        firstDriver = selected;
      }
      
      await this.rideRequestRepo.create({
        bookingId: booking._id,
        driverId: new Types.ObjectId(firstDriver.accountId),
        estimatedDistance: firstDriver.distance,
        estimatedArrivalTime: firstDriver.estimatedArrival,
        expiresAt: booking.expiresAt,
      });

      // Update notified drivers list (only first driver)
      await this.bookingRepo.findByIdAndUpdate(booking._id, {
        notifiedDrivers: [new Types.ObjectId(firstDriver.accountId)],
      });

      // Send email notification to first driver
      await this.notifyDriverByEmail(
        firstDriver,
        {
          bookingId: booking._id.toString(),
          pickupAddress: createBookingDto.origin.address,
          dropoffAddress: createBookingDto.destination.address,
          fare: booking.fare,
          distance: firstDriver.distance,
          estimatedArrival: `~${Math.round(firstDriver.estimatedArrival)} min`,
        },
      );

      this.logger.log(
        `📧 Notified first driver ${firstDriver.accountId} for booking ${booking._id} (${nearbyDrivers.length} drivers available in total)`,
      );

      // Schedule auto-escalation if driver doesn't respond in time
      this.scheduleDriverResponseTimeout(booking._id.toString(), firstDriver.accountId);

      // Schedule auto-cancellation at expiry time
      this.scheduleAutoCancellation(booking._id.toString());

      return {
        bookingId: booking._id,
        status: booking.status,
        fare: booking.fare,
        fareBreakdown: booking.fareBreakdown,
        expiresAt: booking.expiresAt,
        driversNotified: nearbyDrivers.length,
      };
    } catch (error) {
      this.logger.error('Error creating booking:', error);
      throw error;
    }
  }

  /**
   * Estimate fare for a trip
   */
  async estimateFare(estimateFareDto: EstimateFareDto): Promise<any> {
    return this.fareService.calculateFare({
      distanceInMeters: estimateFareDto.distanceInMeters,
      durationInSeconds: estimateFareDto.durationInSeconds,
      vehicleId: estimateFareDto.vehicleId,
      vehicleType: estimateFareDto.vehicleType || 'SEDAN',
    });
  }

  /**
   * Find nearby drivers
   */
  async findNearbyDrivers(
    findNearbyDriversDto: FindNearbyDriversDto,
  ): Promise<any> {
    const drivers = await this.matchingService.findNearbyDrivers(
      findNearbyDriversDto.pickupLat,
      findNearbyDriversDto.pickupLng,
      findNearbyDriversDto.radiusKm,
      findNearbyDriversDto.limit,
      findNearbyDriversDto.vehicleType,
    );

    return {
      count: drivers.length,
      drivers: drivers.map((d) => ({
        _id: d.accountId,
        driverId: d.accountId,
        accountId: d.accountId,
        fullName: d.fullName,
        phoneNumber: d.phoneNumber,
        distance: d.distance,
        estimatedArrival: d.estimatedArrival,
        rating: d.rating,
        isOnline: d.isOnline,
        latitude: d.latitude,
        longitude: d.longitude,
        vehicle: d.vehicle,
        priorityGroup: d.priorityGroup ?? null,   // 'STAND' | 'NEAREST' | null
        matchSource: d.matchSource ?? null,         // 'STAND' | 'NEAREST' | null
      })),
    };
  }

  /**
   * Enrich booking with driver and user details
   */
  private async enrichBooking(booking: any): Promise<any> {
    const enriched = booking.toObject ? booking.toObject() : { ...booking };

    // Enrich with driver details if driverId exists
    if (enriched.driverId) {
      try {
        const driverContact = await this.driverContactService.resolveDriverContact(
          enriched.driverId.toString(),
        );
        if (driverContact) {
          enriched.driver = this.sanitizeDriverPayload(driverContact);
        }
      } catch (err) {
        this.logger.debug(`Failed to enrich driver details: ${err}`);
      }
    }

    // Enrich with user details
    if (enriched.userId) {
      try {
        const userContact = await this.userContactService.resolveUserContact(
          enriched.userId.toString(),
        );
        if (userContact) {
          enriched.user = this.sanitizeUserPayload(userContact);
        }
      } catch (err) {
        this.logger.debug(`Failed to enrich user details: ${err}`);
      }
    }

    return this.sanitizeBookingResponse(enriched);
  }

  private async enrichBookingWithCaches(
    booking: any,
    driverCache: Map<string, any>,
    userCache: Map<string, any>,
  ): Promise<any> {
    const enriched = booking.toObject ? booking.toObject() : { ...booking };

    if (enriched.driverId) {
      const driverId = enriched.driverId.toString();
      if (!driverCache.has(driverId)) {
        try {
          const driverContact = await this.driverContactService.resolveDriverContact(driverId);
          driverCache.set(driverId, driverContact || null);
        } catch {
          driverCache.set(driverId, null);
        }
      }

      const driverContact = driverCache.get(driverId);
      if (driverContact) {
        enriched.driver = this.sanitizeDriverPayload(driverContact);
      }
    }

    if (enriched.userId) {
      const userId = enriched.userId.toString();
      if (!userCache.has(userId)) {
        try {
          const userContact = await this.userContactService.resolveUserContact(userId);
          userCache.set(userId, userContact || null);
        } catch {
          userCache.set(userId, null);
        }
      }

      const userContact = userCache.get(userId);
      if (userContact) {
        enriched.user = this.sanitizeUserPayload(userContact);
      }
    }

    return this.sanitizeBookingResponse(enriched);
  }

  /**
   * Get booking by ID
   */
  async getBookingById(bookingId: string, userId?: string): Promise<any> {
    const booking = await this.bookingRepo.findById(bookingId);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    // Optional: Check if user has access to this booking
    if (userId && booking.userId.toString() !== userId && booking.driverId?.toString() !== userId) {
      throw new ForbiddenException('Access denied to this booking');
    }

    return this.enrichBooking(booking);
  }

  /**
   * Get user's bookings
   */
  async getUserBookings(userId: string, page: number = 1, limit: number = 10): Promise<any> {
    const startedAt = Date.now();
    const { bookings, total } = await this.bookingRepo.findByUserIdPaginated(
      userId,
      page,
      limit,
    );
    const driverCache = new Map<string, any>();
    const userCache = new Map<string, any>();
    await this.preloadContactCaches(bookings, driverCache, userCache);
    const enrichedBookings = await Promise.all(
      bookings.map((b) => this.enrichBookingWithCaches(b, driverCache, userCache)),
    );
    this.logger.log(
      `getUserBookings userId=${userId} page=${page} limit=${limit} total=${total} tookMs=${Date.now() - startedAt}`,
    );
    return {
      count: enrichedBookings.length,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      bookings: enrichedBookings,
    };
  }

  /**
   * Get driver's bookings
   */
  async getDriverBookings(driverId: string, page: number = 1, limit: number = 10): Promise<any> {
    const startedAt = Date.now();
    await this.enforceSingleActiveBookingForDriver(driverId);

    const { bookings, total } = await this.bookingRepo.findByDriverIdPaginated(
      driverId,
      page,
      limit,
    );
    const driverCache = new Map<string, any>();
    const userCache = new Map<string, any>();
    await this.preloadContactCaches(bookings, driverCache, userCache);
    const enrichedBookings = await Promise.all(
      bookings.map((b) => this.enrichBookingWithCaches(b, driverCache, userCache)),
    );
    this.logger.log(
      `getDriverBookings driverId=${driverId} page=${page} limit=${limit} total=${total} tookMs=${Date.now() - startedAt}`,
    );
    return {
      count: enrichedBookings.length,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      bookings: enrichedBookings,
    };
  }

  /**
   * Get driver's current active booking (ACCEPTED / DRIVER_ARRIVED / IN_PROGRESS)
   */
  async getDriverActiveBooking(driverId: string): Promise<any> {
    await this.enforceSingleActiveBookingForDriver(driverId);

    let booking = await this.bookingRepo.findCurrentBookingForDriver(driverId);

    if (booking && (await this.autoCancelExpiredPreRideBooking(booking))) {
      booking = await this.bookingRepo.findCurrentBookingForDriver(driverId);
    }

    if (!booking) {
      return { hasActiveBooking: false, booking: null };
    }

    return {
      hasActiveBooking: true,
      booking: await this.enrichBooking(booking),
    };
  }

  /**
   * Get pending bookings (for drivers to see available rides)
   */
  async getPendingBookings(): Promise<any> {
    const bookings = await this.bookingRepo.findPendingBookings();
    return { count: bookings.length, bookings };
  }

  /**
   * Get pending ride requests for a specific driver
   */
  async getPendingRideRequestsForDriver(driverId: string): Promise<any> {
    const rideRequests = await this.rideRequestRepo.findPendingForDriver(driverId);

    return {
      count: rideRequests.length,
      requests: rideRequests.map((req: any) => ({
        requestId: req._id,
        bookingId: req.bookingId._id,
        booking: req.bookingId,
        estimatedDistance: req.estimatedDistance,
        estimatedArrival: req.estimatedArrivalTime,
        expiresAt: req.expiresAt,
      })),
    };
  }

  /**
   * Accept booking (driver accepts ride request)
   * 🆕 Now generates OTP and sends to user for ride start verification
   */
  async acceptBooking(bookingId: string, driverId: string): Promise<any> {
    await this.enforceSingleActiveBookingForDriver(driverId);

    const booking = await this.bookingRepo.findById(bookingId);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.status !== BookingStatus.PENDING) {
      throw new BadRequestException('Booking is no longer available');
    }

    // Check if driver already rejected this booking
    if (booking.rejectedDrivers.some((id) => id.toString() === driverId)) {
      throw new BadRequestException('You have already rejected this booking');
    }

    if (await this.hasActiveBooking(driverId)) {
      throw new ConflictException('You already have an active booking. Complete it before accepting a new one.');
    }

    // 🆕 Generate OTP for ride start verification
    const otpResult = await this.otpService.generateOtp();
    
    // Update booking with driver assignment and OTP
    const updatedBooking = await this.bookingRepo.updateStatus(
      bookingId,
      BookingStatus.ACCEPTED,
      { 
        driverId: new Types.ObjectId(driverId),
        otpHash: otpResult.otpHash,
        otpExpiresAt: otpResult.expiresAt,
      },
    );

    // Update ride request status
    const rideRequest = await this.rideRequestRepo.findOneByBookingAndDriver(
      bookingId,
      driverId,
    );
    if (rideRequest) {
      await this.rideRequestRepo.updateStatus(rideRequest._id, RideRequestStatus.ACCEPTED);
    }

    // Expire other pending ride requests for this booking
    await this.rideRequestRepo.expireBookingRequests(bookingId);

    this.logger.log(`✅ Booking ${bookingId} accepted by driver ${driverId}`);

    // 🆕 Send OTP email to user with driver and ride details
    await this.sendRideStartOtpToUser(booking, driverId, otpResult.plainOtp);

    // Safety timeout to avoid deadlocks when OTP is not delivered/verified.
    this.schedulePreRideOtpTimeout(bookingId);

    return updatedBooking;
  }

  /**
   * 🆕 Send ride start OTP email to user when driver accepts
   */
  private async sendRideStartOtpToUser(
    booking: any,
    driverId: string,
    otp: string,
  ): Promise<void> {
    try {
      // Get user contact info
      const userContact = await this.userContactService.resolveUserContact(
        booking.userId.toString(),
      );

      if (!userContact?.email) {
        this.logger.warn(`No email found for user ${booking.userId}, cannot send OTP`);
        return;
      }

      // Get driver contact info with vehicle
      const driverContact = await this.driverContactService.resolveDriverContact(driverId);

      const driverName = driverContact?.fullName || 'Your Driver';
      const vehicleInfo = driverContact?.vehicle
        ? `${driverContact.vehicle.color || ''} ${driverContact.vehicle.make || ''} ${driverContact.vehicle.model || ''}`.trim() || 'Vehicle'
        : 'Vehicle';
      const licensePlate = driverContact?.vehicle?.licensePlate || 'N/A';

      await this.notificationService.sendRideStartOtpEmail(
        userContact.email,
        booking.userId.toString(),
        otp,
        {
          bookingId: booking._id.toString(),
          driverName,
          vehicleInfo,
          licensePlate,
          pickupAddress: booking.origin.address,
          dropoffAddress: booking.destination.address,
          estimatedFare: booking.fare,
        },
      );

      this.logger.log(`📧 Ride start OTP sent to user ${booking.userId} for booking ${booking._id}. [DEVELOPMENT MODE OTP: ${otp}]`);
    } catch (error: any) {
      this.logger.error(`Failed to send OTP email to user: ${error.message}`);
      // Don't throw - booking acceptance should still succeed
    }
  }

  /**
   * Notify user when booking is cancelled by system.
   */
  private async sendUserCancellationNotification(booking: any, reason: string): Promise<void> {
    try {
      const userId = booking?.userId?.toString?.() || String(booking?.userId || '');
      if (!userId) return;

      const userContact = await this.userContactService.resolveUserContact(userId);
      if (!userContact?.email) {
        this.logger.warn(`No email found for user ${userId}, cannot send cancellation notification`);
        return;
      }

      await this.notificationService.sendBookingCancelledNotification(
        userContact.email,
        userId,
        {
          bookingId: booking?._id?.toString?.() || String(booking?._id || ''),
          pickupAddress: booking?.origin?.address || 'N/A',
          dropoffAddress: booking?.destination?.address || 'N/A',
          reason,
        },
      );
    } catch (error: any) {
      this.logger.warn(`Failed to send cancellation notification: ${error?.message || error}`);
    }
  }

  /**
   * Reject booking (driver declines ride request)
   * Implements cascading driver assignment - automatically notifies next nearest driver
   */
  async rejectBooking(bookingId: string, driverId: string): Promise<any> {
    const booking = await this.bookingRepo.findById(bookingId);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.status !== BookingStatus.PENDING) {
      throw new BadRequestException('Booking is no longer available');
    }

    // Add driver to rejected list
    await this.bookingRepo.addRejectedDriver(bookingId, driverId);

    // Update ride request status
    const rideRequest = await this.rideRequestRepo.findOneByBookingAndDriver(
      bookingId,
      driverId,
    );
    if (rideRequest) {
      await this.rideRequestRepo.updateStatus(rideRequest._id, RideRequestStatus.REJECTED);
    }

    this.logger.log(`Driver ${driverId} rejected booking ${bookingId}`);

    // 🔄 CASCADING FALLBACK: Notify next nearest driver
    await this.notifyNextAvailableDriver(bookingId);

    return { message: 'Booking rejected successfully. Notifying next available driver.' };
  }

  /**
   * 🆕 Mark driver as arrived at pickup location
   * Sends notification to user with OTP reminder
   */
  async markDriverArrived(bookingId: string, driverId: string): Promise<any> {
    const booking = await this.bookingRepo.findById(bookingId);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.driverId?.toString() !== driverId) {
      throw new ForbiddenException('Access denied to this booking');
    }

    if (booking.status !== BookingStatus.ACCEPTED) {
      throw new BadRequestException('Booking must be accepted before marking as arrived');
    }

    // Update status to DRIVER_ARRIVED
    const updatedBooking = await this.bookingRepo.updateStatus(
      bookingId,
      BookingStatus.DRIVER_ARRIVED,
      { driverArrivedAt: new Date() },
    );

    // Notify user that driver has arrived
    const userContact = await this.userContactService.resolveUserContact(
      booking.userId.toString(),
    );

    if (userContact?.email) {
      const driverContact = await this.driverContactService.resolveDriverContact(driverId);

      await this.notificationService.sendDriverArrivedNotification(
        userContact.email,
        booking.userId.toString(),
        {
          bookingId: bookingId,
          driverName: driverContact?.fullName || 'Your Driver',
          vehicleInfo: driverContact?.vehicle
            ? `${driverContact.vehicle.color || ''} ${driverContact.vehicle.make || ''} ${driverContact.vehicle.model || ''}`.trim() || 'Vehicle'
            : 'Vehicle',
          licensePlate: driverContact?.vehicle?.licensePlate || 'N/A',
          pickupAddress: booking.origin.address,
        },
      );

      this.logger.log(`📍 Driver arrived notification sent for booking ${bookingId}`);
    }

    this.logger.log(`📍 Driver ${driverId} arrived at pickup for booking ${bookingId}`);

    return {
      ...(updatedBooking?.toObject() || {}),
      message: 'Driver arrived. User has been notified to share the OTP.',
    };
  }

  /**
   * 🆕 Notify next available driver (cascading assignment)
   * This method is called when a driver rejects or times out
   */
  private async notifyNextAvailableDriver(bookingId: string): Promise<void> {
    try {
      const booking = await this.bookingRepo.findById(bookingId);

      if (!booking || booking.status !== BookingStatus.PENDING) {
        this.logger.debug(`Booking ${bookingId} is no longer pending, skipping next driver notification`);
        return;
      }

      // Get all rejected driver IDs
      const rejectedDriverIds = booking.rejectedDrivers.map(id => id.toString());
      const notifiedDriverIds = booking.notifiedDrivers.map(id => id.toString());

      // Find nearby drivers
      const nearbyDrivers = await this.matchingService.findNearbyDrivers(
        booking.origin.coordinates.lat,
        booking.origin.coordinates.lng,
        undefined,
        undefined,
        booking.vehicleType || undefined,
      );

      // Find first driver who hasn't been rejected or notified yet
      const candidateDrivers = nearbyDrivers.filter(
        (driver) =>
          !rejectedDriverIds.includes(driver.accountId) &&
          !notifiedDriverIds.includes(driver.accountId),
      );

      const nextDriver = await this.pickFirstFreeDriver(candidateDrivers);

      if (!nextDriver) {
        // ❌ NO MORE DRIVERS AVAILABLE - Auto-cancel booking
        this.logger.warn(`No more drivers available for booking ${bookingId}. Auto-cancelling.`);
        
        await this.bookingRepo.updateStatus(
          bookingId,
          BookingStatus.CANCELLED,
          {
            cancelReason: 'No drivers available in your area',
            cancelledBy: 'SYSTEM',
            cancelledAt: new Date(),
          },
        );

        await this.sendUserCancellationNotification(
          booking,
          'No drivers available in your area',
        );

        this.logger.log(`✅ Booking ${bookingId} auto-cancelled - no drivers available`);
        return;
      }

      // ✅ Found next driver - Create ride request and notify
      await this.rideRequestRepo.create({
        bookingId: booking._id,
        driverId: new Types.ObjectId(nextDriver.accountId),
        estimatedDistance: nextDriver.distance,
        estimatedArrivalTime: nextDriver.estimatedArrival,
        expiresAt: booking.expiresAt,
      });

      // Update notified drivers list
      await this.bookingRepo.findByIdAndUpdate(booking._id, {
        notifiedDrivers: [...booking.notifiedDrivers, new Types.ObjectId(nextDriver.accountId)],
      });

      await this.notifyDriverByEmail(
        nextDriver,
        {
          bookingId: booking._id.toString(),
          pickupAddress: booking.origin.address,
          dropoffAddress: booking.destination.address,
          fare: booking.fare,
          distance: nextDriver.distance,
          estimatedArrival: `~${Math.round(nextDriver.estimatedArrival)} min`,
        },
      );

      this.logger.log(
        `✅ Notified next driver ${nextDriver.accountId} for booking ${bookingId} (Distance: ${nextDriver.distance}km)`,
      );
    } catch (error) {
      this.logger.error(`Error notifying next driver for booking ${bookingId}:`, error);
      // Don't throw - this is a background operation
    }
  }

  private async notifyDriverByEmail(
    driver: { accountId: string; email?: string | null },
    rideDetails: {
      bookingId: string;
      pickupAddress: string;
      dropoffAddress: string;
      fare: number;
      distance: number;
      estimatedArrival: string;
    },
  ): Promise<void> {
    if (!this.enableDriverRideEmails) {
      this.logger.debug(
        `Driver email notifications disabled. Skipping email for driver ${driver.accountId}.`,
      );
      return;
    }

    let email = String(driver.email || '').trim();

    // If no email from matching service, resolve it from DB directly
    if (!email || !email.includes('@')) {
      const contact = await this.driverContactService.resolveDriverContact(
        driver.accountId,
      );
      if (contact?.email) {
        email = contact.email.trim();
        this.logger.debug(`Resolved driver ${driver.accountId} email from DB: ${email}`);
      }
    }

    if (!email || !email.includes('@')) {
      this.logger.warn(
        `Skipping ride-request email for driver ${driver.accountId}: no valid email resolved.`,
      );
      return;
    }

    await this.notificationService.sendDriverRideRequest(
      email,
      driver.accountId,
      rideDetails,
    );
  }

  /**
   * Update booking status
   */
  async updateBookingStatus(
    bookingId: string,
    updateStatusDto: UpdateBookingStatusDto,
    userId: string,
  ): Promise<any> {
    const booking = await this.bookingRepo.findById(bookingId);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    // Authorization check
    const isUser = booking.userId.toString() === userId;
    const isDriver = booking.driverId?.toString() === userId;

    if (!isUser && !isDriver) {
      throw new ForbiddenException('Access denied to this booking');
    }

    // Validate status transition
    this.validateStatusTransition(booking.status, updateStatusDto.status, isUser, isDriver);

    // Additional updates based on status
    const additionalUpdates: any = {};

    if (updateStatusDto.status === BookingStatus.CANCELLED) {
      additionalUpdates.cancelReason = updateStatusDto.cancelReason || 'No reason provided';
      additionalUpdates.cancelledBy = isUser ? 'USER' : 'DRIVER';
    }

    const updatedBooking = await this.bookingRepo.updateStatus(
      bookingId,
      updateStatusDto.status,
      additionalUpdates,
    );

    this.logger.log(`Booking ${bookingId} status updated to ${updateStatusDto.status}`);

    if (updateStatusDto.status === BookingStatus.CANCELLED) {
      const whoCancelled = isUser ? 'USER' : 'DRIVER';
      const reason = additionalUpdates.cancelReason || 'No reason provided';
      await this.sendUserCancellationNotification(
        booking,
        `Cancelled by ${whoCancelled}: ${reason}`,
      );
    }

    return updatedBooking;
  }

  /**
   * 🆕 Regenerate OTP for ride start (if user needs a new one)
   * Can be called when driver is ACCEPTED or DRIVER_ARRIVED
   */
  async generateOtp(bookingId: string, userId: string): Promise<any> {
    const booking = await this.bookingRepo.findById(bookingId);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.userId.toString() !== userId) {
      throw new ForbiddenException('Access denied to this booking');
    }

    // OTP can be regenerated for ACCEPTED or DRIVER_ARRIVED status
    if (booking.status !== BookingStatus.ACCEPTED && booking.status !== BookingStatus.DRIVER_ARRIVED) {
      throw new BadRequestException('OTP can only be generated when driver is assigned or arrived');
    }

    // Generate new OTP
    const otpResult = await this.otpService.generateOtp();

    // Update booking with new OTP hash
    await this.bookingRepo.findByIdAndUpdate(bookingId, {
      otpHash: otpResult.otpHash,
      otpExpiresAt: otpResult.expiresAt,
    });

    // Get user email and send OTP
    const userContact = await this.userContactService.resolveUserContact(userId);
    
    if (userContact?.email) {
      try {
        // Get driver info for context
        const driverContact = booking.driverId 
          ? await this.driverContactService.resolveDriverContact(booking.driverId.toString())
          : null;

        await this.notificationService.sendRideStartOtpEmail(
          userContact.email,
          userId,
          otpResult.plainOtp,
          {
            bookingId: bookingId,
            driverName: driverContact?.fullName || 'Your Driver',
            vehicleInfo: driverContact?.vehicle
              ? `${driverContact.vehicle.color || ''} ${driverContact.vehicle.make || ''} ${driverContact.vehicle.model || ''}`.trim() || 'Vehicle'
              : 'Vehicle',
            licensePlate: driverContact?.vehicle?.licensePlate || 'N/A',
            pickupAddress: booking.origin.address,
            dropoffAddress: booking.destination.address,
            estimatedFare: booking.fare,
          },
        );
      } catch (err: any) {
        this.logger.error(`Failed to send regenerated OTP email: ${err.message}`);
      }
    }

    this.logger.log(`OTP regenerated for booking ${bookingId}. [DEVELOPMENT MODE OTP: ${otpResult.plainOtp}]`);

    return {
      message: 'New OTP sent to your registered email',
      expiresAt: otpResult.expiresAt,
      rideOtp: otpResult.plainOtp,
    };
  }

  /**
   * 🆕 Verify OTP and START the ride (changed from complete)
   * Driver enters OTP provided by user to start ride tracking
   */
  async verifyOtpAndComplete(
    bookingId: string,
    verifyOtpDto: VerifyOtpDto,
    driverId: string,
  ): Promise<any> {
    const booking = await this.bookingRepo.findById(bookingId);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.driverId?.toString() !== driverId) {
      throw new ForbiddenException('Access denied to this booking');
    }

    if (await this.autoCancelExpiredPreRideBooking(booking)) {
      throw new BadRequestException(
        `Booking expired because OTP was not verified within ${this.preRideOtpTimeoutMinutes} minutes. Please request a new booking.`,
      );
    }

    // 🆕 Changed: Allow OTP verification when ACCEPTED or DRIVER_ARRIVED (to START ride)
    if (booking.status !== BookingStatus.ACCEPTED && booking.status !== BookingStatus.DRIVER_ARRIVED) {
      throw new BadRequestException('Ride can only be started when driver is assigned or arrived');
    }

    // Verify OTP
    await this.otpService.verifyOtp(
      verifyOtpDto.otp,
      booking.otpHash,
      booking.otpExpiresAt,
    );

    // 🆕 Changed: Start the ride (IN_PROGRESS) instead of completing
    const updatedBooking = await this.bookingRepo.updateStatus(
      bookingId,
      BookingStatus.IN_PROGRESS,
      { 
        otpVerifiedAt: new Date(),
        startedAt: new Date(),
      },
    );

    this.logger.log(`✅ Booking ${bookingId} ride started (OTP verified)`);

    return {
      ...(updatedBooking?.toObject() || {}),
      message: 'Ride started successfully!',
    };
  }

  /**
   * 🆕 Complete the ride (called by driver when reaching destination)
   */
  async completeRide(bookingId: string, driverId: string): Promise<any> {
    const booking = await this.bookingRepo.findById(bookingId);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.driverId?.toString() !== driverId) {
      throw new ForbiddenException('Access denied to this booking');
    }

    if (booking.status !== BookingStatus.IN_PROGRESS) {
      throw new BadRequestException('Ride must be in progress to complete');
    }

    const updatedBooking = await this.bookingRepo.updateStatus(
      bookingId,
      BookingStatus.COMPLETED,
      { completedAt: new Date() },
    );

    this.logger.log(`✅ Booking ${bookingId} completed`);

    return updatedBooking;
  }

  /**
   * Rate booking after completion
   */
  async rateBooking(
    bookingId: string,
    rateBookingDto: RateBookingDto,
    userId: string,
  ): Promise<any> {
    const booking = await this.bookingRepo.findById(bookingId);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.userId.toString() !== userId) {
      throw new ForbiddenException('Access denied to this booking');
    }

    if (booking.status !== BookingStatus.COMPLETED) {
      throw new BadRequestException('Can only rate completed bookings');
    }

    const updatedBooking = await this.bookingRepo.findByIdAndUpdate(bookingId, {
      rating: rateBookingDto.rating,
      feedback: rateBookingDto.feedback,
    });

    this.logger.log(`Booking ${bookingId} rated: ${rateBookingDto.rating} stars`);

    return updatedBooking;
  }

  async listBookingsForAdmin(filters: {
    status?: string;
    userId?: string;
    driverId?: string;
    page?: string;
    limit?: string;
  }) {
    const page = Math.max(1, Math.floor(Number(filters.page) || 1));
    const limit = Math.min(100, Math.max(1, Math.floor(Number(filters.limit) || 20)));

    const { bookings, total } = await this.bookingRepo.findAdminList(
      {
        status: filters.status,
        userId: filters.userId,
        driverId: filters.driverId,
      },
      page,
      limit,
    );

    const driverCache = new Map<string, any>();
    const userCache = new Map<string, any>();
    await this.preloadContactCaches(bookings, driverCache, userCache);
    const enrichedBookings = await Promise.all(
      bookings.map((booking) => this.enrichBookingWithCaches(booking, driverCache, userCache)),
    );

    return {
      total,
      page,
      limit,
      bookings: enrichedBookings,
    };
  }

  private toCsvValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    const raw = String(value);
    if (raw.includes('"') || raw.includes(',') || raw.includes('\n') || raw.includes('\r')) {
      return `"${raw.replace(/"/g, '""')}"`;
    }
    return raw;
  }

  async exportBookingsForAdmin(filters: {
    status?: string;
    userId?: string;
    driverId?: string;
    from?: string;
    to?: string;
  }): Promise<string> {
    const bookings = await this.bookingRepo.findAdminAll({
      status: filters.status,
      userId: filters.userId,
      driverId: filters.driverId,
      from: filters.from,
      to: filters.to,
    });

    const header = [
      'bookingId',
      'status',
      'userId',
      'driverId',
      'origin',
      'destination',
      'fare',
      'paymentMethod',
      'paymentStatus',
      'createdAt',
      'scheduledAt',
      'completedAt',
    ];

    const rows = bookings.map((booking: any) => [
      booking._id,
      booking.status,
      booking.userId,
      booking.driverId,
      booking.origin?.address || '',
      booking.destination?.address || '',
      booking.fare,
      booking.paymentMethod,
      booking.paymentStatus,
      booking.createdAt ? new Date(booking.createdAt).toISOString() : '',
      booking.scheduledAt ? new Date(booking.scheduledAt).toISOString() : '',
      booking.completedAt ? new Date(booking.completedAt).toISOString() : '',
    ]);

    const lines = [header, ...rows].map((row) => row.map(this.toCsvValue).join(','));
    return lines.join('\n');
  }

  async getBookingByIdAdmin(bookingId: string) {
    if (!Types.ObjectId.isValid(bookingId)) {
      throw new BadRequestException('Invalid booking id');
    }

    const booking = await this.bookingRepo.findById(bookingId);
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    return this.enrichBooking(booking);
  }

  async cancelBookingByAdmin(bookingId: string, reason?: string) {
    if (!Types.ObjectId.isValid(bookingId)) {
      throw new BadRequestException('Invalid booking id');
    }

    const booking = await this.bookingRepo.findById(bookingId);
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.status === BookingStatus.CANCELLED) {
      return this.sanitizeBookingResponse(booking);
    }

    const updated = await this.bookingRepo.updateStatus(
      bookingId,
      BookingStatus.CANCELLED,
      {
        cancelReason: reason || 'Cancelled by admin',
        cancelledBy: 'ADMIN',
        cancelledAt: new Date(),
      },
    );

    await this.sendUserCancellationNotification(
      booking,
      `Cancelled by admin: ${reason || 'No reason provided'}`,
    );

    return updated;
  }

  async assignDriverByAdmin(bookingId: string, driverId: string) {
    if (!Types.ObjectId.isValid(bookingId)) {
      throw new BadRequestException('Invalid booking id');
    }

    if (!Types.ObjectId.isValid(driverId)) {
      throw new BadRequestException('Invalid driver id');
    }

    const booking = await this.bookingRepo.findById(bookingId);
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.status === BookingStatus.CANCELLED || booking.status === BookingStatus.COMPLETED) {
      throw new BadRequestException('Cannot assign driver to completed or cancelled booking');
    }

    const updated = await this.bookingRepo.updateStatus(
      bookingId,
      BookingStatus.ACCEPTED,
      {
        driverId: new Types.ObjectId(driverId),
      },
    );

    return updated;
  }

  /**
   * Validate status transition
   */
  private validateStatusTransition(
    currentStatus: BookingStatus,
    newStatus: BookingStatus,
    isUser: boolean,
    isDriver: boolean,
  ): void {
    // Define valid transitions
    const validTransitions: Record<BookingStatus, BookingStatus[]> = {
      [BookingStatus.PENDING]: [BookingStatus.ACCEPTED, BookingStatus.CANCELLED],
      [BookingStatus.ACCEPTED]: [BookingStatus.DRIVER_ARRIVED, BookingStatus.CANCELLED],
      [BookingStatus.DRIVER_ARRIVED]: [BookingStatus.IN_PROGRESS, BookingStatus.CANCELLED],
      [BookingStatus.IN_PROGRESS]: [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
      [BookingStatus.COMPLETED]: [],
      [BookingStatus.CANCELLED]: [],
    };

    if (!validTransitions[currentStatus]?.includes(newStatus)) {
      throw new BadRequestException(
        `Invalid status transition from ${currentStatus} to ${newStatus}`,
      );
    }

    // Only drivers can mark as DRIVER_ARRIVED or IN_PROGRESS
    if (!isDriver && (newStatus === BookingStatus.DRIVER_ARRIVED || newStatus === BookingStatus.IN_PROGRESS)) {
      throw new ForbiddenException('Only drivers can update to this status');
    }
  }

  /**
   * ⏱️ Schedule driver response timeout
   * If driver doesn't respond within timeout, escalate to next driver
   */
  private scheduleDriverResponseTimeout(bookingId: string, driverId: string): void {
    const driverResponseTimeoutMinutes = parseInt(
      process.env.DRIVER_RESPONSE_TIMEOUT_MINUTES || '2',
      10,
    );

    setTimeout(async () => {
      try {
        const booking = await this.bookingRepo.findById(bookingId);

        if (!booking) {
          this.logger.debug(`Booking ${bookingId} not found during timeout check`);
          return;
        }

        // Only escalate if booking is still PENDING (not accepted yet)
        if (booking.status !== BookingStatus.PENDING) {
          this.logger.debug(
            `Booking ${bookingId} status is ${booking.status}, skipping timeout escalation`,
          );
          return;
        }

        // Check if this driver already responded
        const rideRequest = await this.rideRequestRepo.findOneByBookingAndDriver(
          bookingId,
          driverId,
        );

        if (
          rideRequest &&
          (rideRequest.status === RideRequestStatus.ACCEPTED ||
            rideRequest.status === RideRequestStatus.REJECTED)
        ) {
          this.logger.debug(
            `Driver ${driverId} already responded to booking ${bookingId}, skipping timeout`,
          );
          return;
        }

        // ⏰ Driver didn't respond in time - Mark as timed out and escalate
        this.logger.warn(
          `⏰ Driver ${driverId} didn't respond to booking ${bookingId} within ${driverResponseTimeoutMinutes} minutes. Escalating to next driver.`,
        );

        // Mark ride request as expired
        if (rideRequest) {
          await this.rideRequestRepo.updateStatus(
            rideRequest._id,
            RideRequestStatus.EXPIRED,
          );
        }

        // Add driver to rejected list (timeout counts as implicit rejection)
        await this.bookingRepo.addRejectedDriver(bookingId, driverId);

        // Notify next available driver
        await this.notifyNextAvailableDriver(bookingId);
      } catch (error) {
        this.logger.error(
          `Error during driver response timeout for booking ${bookingId}:`,
          error,
        );
      }
    }, driverResponseTimeoutMinutes * 60 * 1000);
  }

  /**
   * Auto-cancel bookings that are stuck before ride start (OTP never verified).
   */
  private schedulePreRideOtpTimeout(bookingId: string): void {
    setTimeout(async () => {
      try {
        const booking = await this.bookingRepo.findById(bookingId);
        if (!booking) {
          return;
        }

        await this.autoCancelExpiredPreRideBooking(booking);
      } catch (error) {
        this.logger.error(
          `Error during pre-ride OTP timeout for booking ${bookingId}:`,
          error,
        );
      }
    }, this.getPreRideTimeoutMs() + 1000);
  }

  /**
   * Schedule auto-cancellation for booking
   */
  private scheduleAutoCancellation(bookingId: string): void {
    setTimeout(async () => {
      try {
        const booking = await this.bookingRepo.findById(bookingId);

        if (booking && booking.status === BookingStatus.PENDING) {
          const cancelReason = 'Auto-cancelled: No driver accepted within time limit';
          await this.bookingRepo.updateStatus(bookingId, BookingStatus.CANCELLED, {
            cancelReason,
            cancelledBy: 'SYSTEM',
          });

          await this.sendUserCancellationNotification(booking, cancelReason);

          // Expire all ride requests
          await this.rideRequestRepo.expireBookingRequests(bookingId);

          this.logger.log(`⏰ Booking ${bookingId} auto-cancelled after ${this.bookingExpiryMinutes} minutes`);
        }
      } catch (error) {
        this.logger.error(`Error during auto-cancellation of booking ${bookingId}:`, error);
      }
    }, this.bookingExpiryMinutes * 60 * 1000);
  }
}
