import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RideRequestDocument = RideRequest & Document;

export enum RideRequestStatus {
  PENDING = 'PENDING',
  VIEWED = 'VIEWED',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
}

@Schema({ timestamps: true })
export class RideRequest {
  @Prop({ type: Types.ObjectId, ref: 'Booking', required: true, index: true })
  bookingId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  driverId: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(RideRequestStatus), default: RideRequestStatus.PENDING })
  status: RideRequestStatus;

  @Prop({ type: Number, required: true })
  estimatedDistance: number;

  @Prop({ type: Number, default: null })
  estimatedArrivalTime: number | null;

  @Prop({ type: Date, default: Date.now })
  notifiedAt: Date;

  @Prop({ type: Date, default: null })
  viewedAt: Date | null;

  @Prop({ type: Date, default: null })
  respondedAt: Date | null;

  @Prop({ type: Date, default: null })
  expiresAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export const RideRequestSchema = SchemaFactory.createForClass(RideRequest);

RideRequestSchema.index({ driverId: 1, status: 1, createdAt: -1 });
RideRequestSchema.index({ bookingId: 1, driverId: 1 }, { unique: true });
RideRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
