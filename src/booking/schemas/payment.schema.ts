import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PaymentDocument = Payment & Document;

export enum PaymentGateway {
  RAZORPAY = 'RAZORPAY',
  CASH = 'CASH',
  INTERNAL_WALLET = 'INTERNAL_WALLET',
}

export enum PaymentRecordStatus {
  CREATED = 'CREATED',
  PENDING = 'PENDING',
  CAPTURED = 'CAPTURED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

@Schema({ timestamps: true, collection: 'payments' })
export class Payment {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  bookingId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, default: null, index: true })
  driverId: Types.ObjectId | null;

  @Prop({ type: Number, required: true, min: 0 })
  amount: number;

  @Prop({ type: String, default: 'INR' })
  currency: string;

  @Prop({ type: String, required: true })
  method: string;

  @Prop({ type: String, enum: Object.values(PaymentGateway), required: true })
  gateway: PaymentGateway;

  @Prop({ type: String, enum: Object.values(PaymentRecordStatus), default: PaymentRecordStatus.CREATED, index: true })
  status: PaymentRecordStatus;

  @Prop({ type: String, unique: true, sparse: true })
  razorpayOrderId?: string;

  @Prop({ type: String, unique: true, sparse: true })
  razorpayPaymentId?: string;

  @Prop({ type: String, default: null })
  razorpaySignature: string | null;

  @Prop({ type: String, default: null })
  receipt: string | null;

  @Prop({ type: Number, default: 0, min: 0 })
  commissionAmount: number;

  @Prop({ type: Number, default: 0, min: 0 })
  driverEarningAmount: number;

  @Prop({ type: Boolean, default: false })
  settledToDriver: boolean;

  @Prop({ type: Date, default: null })
  settledAt: Date | null;

  @Prop({ type: Date, default: null })
  paidAt: Date | null;

  @Prop({ type: Date, default: null })
  refundedAt: Date | null;

  @Prop({ type: Number, default: 0, min: 0 })
  refundAmount: number;

  @Prop({ type: String, default: null })
  webhookEventId: string | null;

  @Prop({ type: String, default: null })
  errorCode: string | null;

  @Prop({ type: String, default: null })
  errorDescription: string | null;

  @Prop({ type: String, default: null })
  payoutReference: string | null;

  @Prop({ type: Object, default: null })
  metadata: Record<string, any> | null;

  createdAt: Date;
  updatedAt: Date;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);

PaymentSchema.index({ bookingId: 1, createdAt: -1 });
PaymentSchema.index({ userId: 1, status: 1, createdAt: -1 });
PaymentSchema.index({ driverId: 1, settledToDriver: 1, createdAt: -1 });
