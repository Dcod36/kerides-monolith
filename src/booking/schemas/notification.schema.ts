import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NotificationDocument = Notification & Document;

export enum NotificationType {
  OTP = 'OTP',
  BOOKING_CREATED = 'BOOKING_CREATED',
  BOOKING_ACCEPTED = 'BOOKING_ACCEPTED',
  DRIVER_ARRIVED = 'DRIVER_ARRIVED',
  RIDE_STARTED = 'RIDE_STARTED',
  RIDE_COMPLETED = 'RIDE_COMPLETED',
  BOOKING_CANCELLED = 'BOOKING_CANCELLED',
  RIDE_REQUEST = 'RIDE_REQUEST',
}

export enum NotificationChannel {
  EMAIL = 'EMAIL',
  SMS = 'SMS',
  PUSH = 'PUSH',
}

export enum NotificationStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  RETRYING = 'RETRYING',
}

@Schema({ timestamps: true })
export class Notification {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  recipientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, default: null, index: true })
  bookingId: Types.ObjectId | null;

  @Prop({ type: String, enum: Object.values(NotificationType), required: true })
  type: NotificationType;

  @Prop({ type: String, enum: Object.values(NotificationChannel), required: true })
  channel: NotificationChannel;

  @Prop({ type: String, enum: Object.values(NotificationStatus), default: NotificationStatus.PENDING })
  status: NotificationStatus;

  @Prop({ type: String, required: true })
  recipient: string;

  @Prop({ type: String, default: null })
  subject: string | null;

  @Prop({ type: String, required: true })
  message: string;

  @Prop({ type: Object, default: null })
  metadata: Record<string, any> | null;

  @Prop({ type: Date, default: null })
  sentAt: Date | null;

  @Prop({ type: String, default: null })
  errorMessage: string | null;

  @Prop({ type: Number, default: 0 })
  retryCount: number;

  @Prop({ type: Date, default: null })
  nextRetryAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

NotificationSchema.index({ recipientId: 1, createdAt: -1 });
NotificationSchema.index({ bookingId: 1, type: 1 });
NotificationSchema.index({ status: 1, nextRetryAt: 1 });
NotificationSchema.index({ createdAt: -1 });
