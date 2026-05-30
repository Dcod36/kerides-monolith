import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RideRequest, RideRequestDocument, RideRequestStatus } from '../schemas/ride-request.schema';

@Injectable()
export class RideRequestRepository {
  constructor(
    @InjectModel(RideRequest.name) private readonly rideRequestModel: Model<RideRequestDocument>,
  ) {}

  async create(rideRequestData: Partial<RideRequest>): Promise<RideRequestDocument> {
    const rideRequest = new this.rideRequestModel(rideRequestData);
    return rideRequest.save();
  }

  async createMany(rideRequests: Partial<RideRequest>[]): Promise<RideRequestDocument[]> {
    return this.rideRequestModel.insertMany(rideRequests) as any;
  }

  async findById(id: string | Types.ObjectId): Promise<RideRequestDocument | null> {
    return this.rideRequestModel.findById(id).exec();
  }

  async findByDriverId(
    driverId: string | Types.ObjectId,
    status?: RideRequestStatus,
  ): Promise<RideRequestDocument[]> {
    const query: any = { driverId };
    if (status) {
      query.status = status;
    }

    return this.rideRequestModel
      .find(query)
      .populate('bookingId')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findPendingForDriver(driverId: string | Types.ObjectId): Promise<RideRequestDocument[]> {
    return this.rideRequestModel
      .find({
        driverId,
        status: RideRequestStatus.PENDING,
        expiresAt: { $gt: new Date() },
      })
      .populate('bookingId')
      .sort({ createdAt: 1 })
      .exec();
  }

  async findByBookingId(bookingId: string | Types.ObjectId): Promise<RideRequestDocument[]> {
    return this.rideRequestModel
      .find({ bookingId })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOneByBookingAndDriver(
    bookingId: string | Types.ObjectId,
    driverId: string | Types.ObjectId,
  ): Promise<RideRequestDocument | null> {
    return this.rideRequestModel
      .findOne({ bookingId, driverId })
      .exec();
  }

  async updateStatus(
    id: string | Types.ObjectId,
    status: RideRequestStatus,
  ): Promise<RideRequestDocument | null> {
    const updates: any = { status, respondedAt: new Date() };

    if (status === RideRequestStatus.VIEWED && !updates.viewedAt) {
      updates.viewedAt = new Date();
    }

    return this.rideRequestModel
      .findByIdAndUpdate(id, updates, { new: true })
      .exec();
  }

  async expireBookingRequests(bookingId: string | Types.ObjectId): Promise<void> {
    await this.rideRequestModel
      .updateMany(
        { bookingId, status: RideRequestStatus.PENDING },
        { status: RideRequestStatus.EXPIRED, respondedAt: new Date() },
      )
      .exec();
  }

  async markAsViewed(id: string | Types.ObjectId): Promise<RideRequestDocument | null> {
    return this.rideRequestModel
      .findByIdAndUpdate(
        id,
        { viewedAt: new Date() },
        { new: true },
      )
      .exec();
  }

  async delete(id: string | Types.ObjectId): Promise<RideRequestDocument | null> {
    return this.rideRequestModel.findByIdAndDelete(id).exec();
  }

  async deleteByBookingId(bookingId: string | Types.ObjectId): Promise<void> {
    await this.rideRequestModel.deleteMany({ bookingId }).exec();
  }
}
