import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BookingDocument = Booking & Document;

export enum BookingStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  DRIVER_ARRIVED = 'DRIVER_ARRIVED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentMethod {
  CASH = 'CASH',
  CARD = 'CARD',
  UPI = 'UPI',
  NETBANKING = 'NETBANKING',
  WALLET = 'WALLET',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

@Schema({ timestamps: true })
export class Booking {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, default: null, index: true })
  driverId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, default: null })
  vehicleId: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  vehicleType: string | null;

  @Prop({
    type: {
      address: { type: String, required: true },
      coordinates: {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
      },
    },
    required: true,
  })
  origin: {
    address: string;
    coordinates: { lat: number; lng: number };
  };

  @Prop({
    type: {
      address: { type: String, required: true },
      coordinates: {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
      },
    },
    required: true,
  })
  destination: {
    address: string;
    coordinates: { lat: number; lng: number };
  };

  @Prop({
    type: {
      text: { type: String, required: true },
      value: { type: Number, required: true },
    },
    required: true,
  })
  distance: { text: string; value: number };

  @Prop({
    type: {
      text: { type: String, required: true },
      value: { type: Number, required: true },
    },
    required: true,
  })
  duration: { text: string; value: number };

  @Prop({ type: Number, required: true, min: 0 })
  fare: number;

  @Prop({
    type: {
      baseFare: Number,
      distanceFare: Number,
      timeFare: Number,
      surgeFare: Number,
      total: Number,
    },
    default: null,
  })
  fareBreakdown: {
    baseFare: number;
    distanceFare: number;
    timeFare: number;
    surgeFare: number;
    total: number;
  } | null;

  @Prop({ type: String, enum: Object.values(BookingStatus), default: BookingStatus.PENDING, index: true })
  status: BookingStatus;

  @Prop({ type: String, default: null })
  otpHash: string | null;

  @Prop({ type: Date, default: null })
  otpExpiresAt: Date | null;

  @Prop({ type: Date, default: null })
  otpVerifiedAt: Date | null;

  @Prop({ type: String, enum: Object.values(PaymentMethod), default: PaymentMethod.CASH })
  paymentMethod: PaymentMethod;

  @Prop({ type: String, enum: Object.values(PaymentStatus), default: PaymentStatus.PENDING })
  paymentStatus: PaymentStatus;

  @Prop({ type: String, default: null })
  paymentTransactionId: string | null;

  @Prop({ type: Date, default: null })
  scheduledAt: Date | null;

  @Prop({ type: Date, default: null })
  expiresAt: Date | null;

  @Prop({ type: [Types.ObjectId], default: [] })
  rejectedDrivers: Types.ObjectId[];

  @Prop({ type: [Types.ObjectId], default: [] })
  notifiedDrivers: Types.ObjectId[];

  @Prop({ type: Date, default: null })
  acceptedAt: Date | null;

  @Prop({ type: Date, default: null })
  driverArrivedAt: Date | null;

  @Prop({ type: Date, default: null })
  startedAt: Date | null;

  @Prop({ type: Date, default: null })
  completedAt: Date | null;

  @Prop({ type: Date, default: null })
  cancelledAt: Date | null;

  @Prop({ type: String, default: null })
  cancelReason: string | null;

  @Prop({ type: String, default: null })
  cancelledBy: string | null;

  @Prop({ type: Number, min: 1, max: 5, default: null })
  rating: number | null;

  @Prop({ type: String, default: null })
  feedback: string | null;

  @Prop({ type: String, default: null })
  notes: string | null;

  createdAt: Date;
  updatedAt: Date;
}

export const BookingSchema = SchemaFactory.createForClass(Booking);

BookingSchema.index({ userId: 1, status: 1 });
BookingSchema.index({ driverId: 1, status: 1 });
BookingSchema.index({ userId: 1, createdAt: -1 });
BookingSchema.index({ driverId: 1, createdAt: -1 });
BookingSchema.index({ status: 1, expiresAt: 1 });
BookingSchema.index({ createdAt: -1 });
