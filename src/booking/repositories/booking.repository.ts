import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Booking, BookingDocument, BookingStatus } from '../schemas/booking.schema';

@Injectable()
export class BookingRepository {
  private readonly bookingListProjection = {
    userId: 1,
    driverId: 1,
    vehicleId: 1,
    vehicleType: 1,
    origin: 1,
    destination: 1,
    fare: 1,
    fareBreakdown: 1,
    status: 1,
    paymentMethod: 1,
    paymentStatus: 1,
    scheduledAt: 1,
    acceptedAt: 1,
    driverArrivedAt: 1,
    startedAt: 1,
    completedAt: 1,
    cancelledAt: 1,
    cancelReason: 1,
    rating: 1,
    feedback: 1,
    notes: 1,
    createdAt: 1,
    updatedAt: 1,
  } as const;

  constructor(
    @InjectModel(Booking.name) private readonly bookingModel: Model<BookingDocument>,
  ) {}

  private toObjectId(id: string | Types.ObjectId): Types.ObjectId | null {
    if (id instanceof Types.ObjectId) return id;
    if (!Types.ObjectId.isValid(id)) return null;
    return new Types.ObjectId(id);
  }

  async create(bookingData: Partial<Booking>): Promise<BookingDocument> {
    const booking = new this.bookingModel(bookingData);
    return booking.save();
  }

  async findById(id: string | Types.ObjectId): Promise<BookingDocument | null> {
    return this.bookingModel.findById(id).exec();
  }

  async findByIdAndUpdate(
    id: string | Types.ObjectId,
    update: Partial<Booking>,
  ): Promise<BookingDocument | null> {
    return this.bookingModel.findByIdAndUpdate(id, update, { new: true }).exec();
  }

  async findByUserId(userId: string | Types.ObjectId): Promise<BookingDocument[]> {
    const userObjectId = this.toObjectId(userId);
    if (!userObjectId) return [];
    return this.bookingModel
      .find({ userId: userObjectId })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByDriverId(driverId: string | Types.ObjectId): Promise<BookingDocument[]> {
    const driverObjectId = this.toObjectId(driverId);
    if (!driverObjectId) return [];
    return this.bookingModel
      .find({ driverId: driverObjectId })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByUserIdPaginated(
    userId: string | Types.ObjectId,
    page: number,
    limit: number,
  ): Promise<{ bookings: any[]; total: number }> {
    const userObjectId = this.toObjectId(userId);
    if (!userObjectId) return { bookings: [], total: 0 };
    const skip = (page - 1) * limit;

    const [bookings, total] = await Promise.all([
      this.bookingModel
        .find({ userId: userObjectId })
        .select(this.bookingListProjection)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.bookingModel.countDocuments({ userId: userObjectId }).exec(),
    ]);

    return { bookings, total };
  }

  async findByDriverIdPaginated(
    driverId: string | Types.ObjectId,
    page: number,
    limit: number,
  ): Promise<{ bookings: any[]; total: number }> {
    const driverObjectId = this.toObjectId(driverId);
    if (!driverObjectId) return { bookings: [], total: 0 };
    const skip = (page - 1) * limit;

    const [bookings, total] = await Promise.all([
      this.bookingModel
        .find({ driverId: driverObjectId })
        .select(this.bookingListProjection)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.bookingModel.countDocuments({ driverId: driverObjectId }).exec(),
    ]);

    return { bookings, total };
  }

  async findAdminList(
    filters: { status?: string; userId?: string; driverId?: string },
    page: number,
    limit: number,
  ): Promise<{ bookings: any[]; total: number }> {
    const query: Record<string, any> = {};

    if (filters.status) {
      query.status = filters.status;
    }

    const userObjectId = filters.userId ? this.toObjectId(filters.userId) : null;
    if (filters.userId && userObjectId) {
      query.userId = userObjectId;
    }

    const driverObjectId = filters.driverId ? this.toObjectId(filters.driverId) : null;
    if (filters.driverId && driverObjectId) {
      query.driverId = driverObjectId;
    }

    const skip = (page - 1) * limit;

    const [bookings, total] = await Promise.all([
      this.bookingModel
        .find(query)
        .select(this.bookingListProjection)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.bookingModel.countDocuments(query).exec(),
    ]);

    return { bookings, total };
  }

  async findAdminAll(filters: { status?: string; userId?: string; driverId?: string; from?: string; to?: string }): Promise<any[]> {
    const query: Record<string, any> = {};

    if (filters.status) {
      query.status = filters.status;
    }

    const userObjectId = filters.userId ? this.toObjectId(filters.userId) : null;
    if (filters.userId && userObjectId) {
      query.userId = userObjectId;
    }

    const driverObjectId = filters.driverId ? this.toObjectId(filters.driverId) : null;
    if (filters.driverId && driverObjectId) {
      query.driverId = driverObjectId;
    }

    const fromDate = filters.from ? new Date(filters.from) : null;
    const toDate = filters.to ? new Date(filters.to) : null;
    if ((fromDate && !Number.isNaN(fromDate.getTime())) || (toDate && !Number.isNaN(toDate.getTime()))) {
      query.createdAt = {};
      if (fromDate && !Number.isNaN(fromDate.getTime())) {
        query.createdAt.$gte = fromDate;
      }
      if (toDate && !Number.isNaN(toDate.getTime())) {
        query.createdAt.$lte = toDate;
      }
    }

    return this.bookingModel
      .find(query)
      .select(this.bookingListProjection)
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async findPendingBookings(): Promise<BookingDocument[]> {
    return this.bookingModel
      .find({ status: BookingStatus.PENDING })
      .sort({ createdAt: 1 })
      .exec();
  }

  async findPendingForDriver(driverId: string | Types.ObjectId): Promise<BookingDocument[]> {
    const driverObjectId = this.toObjectId(driverId);
    if (!driverObjectId) return [];

    return this.bookingModel
      .find({
        status: BookingStatus.PENDING,
        rejectedDrivers: { $ne: driverObjectId },
        $or: [
          { driverId: null },
          { driverId: driverObjectId },
        ],
      })
      .sort({ createdAt: 1 })
      .exec();
  }

  async findCurrentBookingForUser(userId: string | Types.ObjectId): Promise<BookingDocument | null> {
    const userObjectId = this.toObjectId(userId);
    if (!userObjectId) return null;
    return this.bookingModel
      .findOne({
        userId: userObjectId,
        status: {
          $in: [
            BookingStatus.PENDING,
            BookingStatus.ACCEPTED,
            BookingStatus.DRIVER_ARRIVED,
            BookingStatus.IN_PROGRESS,
          ],
        },
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findCurrentBookingForDriver(driverId: string | Types.ObjectId): Promise<BookingDocument | null> {
    const driverObjectId = this.toObjectId(driverId);
    if (!driverObjectId) return null;
    return this.bookingModel
      .findOne({
        driverId: driverObjectId,
        status: {
          $in: [
            BookingStatus.ACCEPTED,
            BookingStatus.DRIVER_ARRIVED,
            BookingStatus.IN_PROGRESS,
          ],
        },
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  async addRejectedDriver(
    bookingId: string | Types.ObjectId,
    driverId: string | Types.ObjectId,
  ): Promise<BookingDocument | null> {
    return this.bookingModel
      .findByIdAndUpdate(
        bookingId,
        { $addToSet: { rejectedDrivers: driverId } },
        { new: true },
      )
      .exec();
  }

  async addNotifiedDriver(
    bookingId: string | Types.ObjectId,
    driverId: string | Types.ObjectId,
  ): Promise<BookingDocument | null> {
    return this.bookingModel
      .findByIdAndUpdate(
        bookingId,
        { $addToSet: { notifiedDrivers: driverId } },
        { new: true },
      )
      .exec();
  }

  async findExpiredBookings(): Promise<BookingDocument[]> {
    return this.bookingModel
      .find({
        status: BookingStatus.PENDING,
        expiresAt: { $lte: new Date() },
      })
      .exec();
  }

  async updateStatus(
    id: string | Types.ObjectId,
    status: BookingStatus,
    additionalUpdates?: Partial<Booking>,
  ): Promise<BookingDocument | null> {
    const updates: any = { status, ...additionalUpdates };

    if (status === BookingStatus.ACCEPTED) {
      updates.acceptedAt = new Date();
    } else if (status === BookingStatus.DRIVER_ARRIVED) {
      updates.driverArrivedAt = new Date();
    } else if (status === BookingStatus.IN_PROGRESS) {
      updates.startedAt = new Date();
    } else if (status === BookingStatus.COMPLETED) {
      updates.completedAt = new Date();
    } else if (status === BookingStatus.CANCELLED) {
      updates.cancelledAt = new Date();
    }

    return this.bookingModel
      .findByIdAndUpdate(id, updates, { new: true })
      .exec();
  }

  async countActiveBookings(driverId: string | Types.ObjectId): Promise<number> {
    return this.bookingModel
      .countDocuments({
        driverId,
        status: {
          $in: [
            BookingStatus.ACCEPTED,
            BookingStatus.DRIVER_ARRIVED,
            BookingStatus.IN_PROGRESS,
          ],
        },
      })
      .exec();
  }

  async delete(id: string | Types.ObjectId): Promise<BookingDocument | null> {
    return this.bookingModel.findByIdAndDelete(id).exec();
  }
}
