import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  timestamps: true,
  collection: 'accounts', // same collection as microservices
})
export class Account extends Document {
  @Prop({ required: false, trim: true })
  fullName?: string;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  })
  email: string;

  @Prop({
    required: false,
    unique: true,
    sparse: true,
    trim: true,
  })
  phoneNumber?: string;

  @Prop({
    required: false,
    select: false, // Never returned in queries by default
  })
  passwordHash?: string;

  @Prop({
    enum: ['USER', 'DRIVER', 'ADMIN'],
    default: 'USER',
    index: true,
  })
  role: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  emailVerified: boolean;

  @Prop({ required: false })
  emailOtp?: string;

  @Prop({ required: false })
  emailOtpExpires?: Date;

  // ─── User Profile ────

  @Prop({ required: false })
  profileImage?: string;

  @Prop({ required: false, trim: true })
  address?: string;

  @Prop({ type: Object, required: false })
  addressDetails?: Record<string, any>;

  @Prop({ type: [String], default: [] })
  preferences?: string[];

  // Timestamps added automatically by { timestamps: true }
  createdAt?: Date;
  updatedAt?: Date;
}

export const AccountSchema = SchemaFactory.createForClass(Account);

// Compound index for performance
AccountSchema.index({ role: 1, isActive: 1 });
