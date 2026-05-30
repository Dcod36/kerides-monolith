import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WalletDocument = Wallet & Document;

export enum WalletOwnerType {
  DRIVER = 'DRIVER',
  USER = 'USER',
}

class BankDetails {
  @Prop({ type: String, default: null })
  accountHolderName: string | null;

  @Prop({ type: String, default: null })
  accountNumber: string | null;

  @Prop({ type: String, default: null })
  ifsc: string | null;

  @Prop({ type: String, default: null })
  bankName: string | null;
}

@Schema({ timestamps: true, collection: 'wallets' })
export class Wallet {
  @Prop({ type: String, enum: Object.values(WalletOwnerType), required: true, index: true })
  ownerType: WalletOwnerType;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  ownerId: Types.ObjectId;

  @Prop({ type: Number, default: 0, min: 0 })
  balance: number;

  @Prop({ type: Number, default: 0, min: 0 })
  holdBalance: number;

  @Prop({ type: Number, default: 0, min: 0 })
  totalCredited: number;

  @Prop({ type: Number, default: 0, min: 0 })
  totalDebited: number;

  @Prop({ type: Number, default: 0, min: 0 })
  totalCommission: number;

  @Prop({ type: Number, default: 0, min: 0 })
  totalPayout: number;

  @Prop({ type: Date, default: null })
  lastPayoutAt: Date | null;

  @Prop({ type: String, default: null })
  upiId: string | null;

  @Prop({ type: BankDetails, default: null })
  bankDetails: BankDetails | null;

  createdAt: Date;
  updatedAt: Date;
}

export const WalletSchema = SchemaFactory.createForClass(Wallet);
WalletSchema.index({ ownerType: 1, ownerId: 1 }, { unique: true });
