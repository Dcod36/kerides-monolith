import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RideLocation, RideLocationDocument } from '../schemas/ride-location.schema';

@Injectable()
export class RideLocationRepository {
  constructor(
    @InjectModel(RideLocation.name) private readonly rideLocationModel: Model<RideLocationDocument>,
  ) {}

  async upsertLocation(payload: Partial<RideLocation>): Promise<RideLocationDocument> {
    const bookingId = payload.bookingId as Types.ObjectId;
    return this.rideLocationModel.findOneAndUpdate(
      { bookingId },
      payload,
      { new: true, upsert: true },
    );
  }

  async findByBookingId(bookingId: string | Types.ObjectId): Promise<RideLocationDocument | null> {
    return this.rideLocationModel.findOne({ bookingId }).exec();
  }
}
