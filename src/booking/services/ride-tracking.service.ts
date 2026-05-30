import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { BookingRepository } from '../repositories/booking.repository';
import { RideLocationRepository } from '../repositories/ride-location.repository';
import { BookingStatus } from '../schemas/booking.schema';
import { UpdateRideLocationDto } from '../dto/update-ride-location.dto';

@Injectable()
export class RideTrackingService {
  constructor(
    private readonly bookingRepo: BookingRepository,
    private readonly rideLocationRepo: RideLocationRepository,
  ) {}

  async updateDriverLocation(
    bookingId: string,
    driverId: string,
    dto: UpdateRideLocationDto,
  ): Promise<any> {
    const booking = await this.bookingRepo.findById(bookingId);
    if (!booking) throw new NotFoundException('Booking not found');

    if (String(booking.driverId || '') !== String(driverId)) {
      throw new ForbiddenException('Only assigned driver can update ride location');
    }

    if (booking.status !== BookingStatus.IN_PROGRESS) {
      throw new BadRequestException('Ride location updates are allowed only when ride is IN_PROGRESS');
    }

    return this.rideLocationRepo.upsertLocation({
      bookingId: new Types.ObjectId(bookingId),
      driverId: new Types.ObjectId(driverId),
      coordinates: {
        lat: dto.lat,
        lng: dto.lng,
      },
      speedKmph: dto.speedKmph ?? null,
      heading: dto.heading ?? null,
      accuracyMeters: dto.accuracyMeters ?? null,
      recordedAt: new Date(),
    });
  }

  async getRideLocation(bookingId: string, actorId: string): Promise<any> {
    const booking = await this.bookingRepo.findById(bookingId);
    if (!booking) throw new NotFoundException('Booking not found');

    const isUser = String(booking.userId) === String(actorId);
    const isDriver = String(booking.driverId || '') === String(actorId);
    if (!isUser && !isDriver) {
      throw new ForbiddenException('Access denied to ride location');
    }

    const location = await this.rideLocationRepo.findByBookingId(bookingId);
    return {
      bookingId,
      status: booking.status,
      location,
    };
  }
}
