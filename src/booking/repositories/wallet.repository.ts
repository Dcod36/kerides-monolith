import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Wallet, WalletDocument, WalletOwnerType } from '../schemas/wallet.schema';

@Injectable()
export class WalletRepository {
  constructor(
    @InjectModel(Wallet.name) private readonly walletModel: Model<WalletDocument>,
  ) {}

  async getOrCreate(ownerType: WalletOwnerType, ownerId: string | Types.ObjectId): Promise<WalletDocument> {
    const ownerObjectId = typeof ownerId === 'string' ? new Types.ObjectId(ownerId) : ownerId;
    const wallet = await this.walletModel.findOneAndUpdate(
      { ownerType, ownerId: ownerObjectId },
      {
        $setOnInsert: {
          ownerType,
          ownerId: ownerObjectId,
          balance: 0,
          holdBalance: 0,
          totalCredited: 0,
          totalDebited: 0,
          totalCommission: 0,
          totalPayout: 0,
        },
      },
      { new: true, upsert: true },
    );

    return wallet as WalletDocument;
  }

  async creditOwner(
    ownerType: WalletOwnerType,
    ownerId: string | Types.ObjectId,
    amount: number,
    commissionAmount = 0,
  ): Promise<WalletDocument> {
    const wallet = await this.getOrCreate(ownerType, ownerId);
    const ownerObjectId = typeof ownerId === 'string' ? new Types.ObjectId(ownerId) : ownerId;

    const updated = await this.walletModel.findOneAndUpdate(
      { ownerType, ownerId: ownerObjectId },
      {
        $inc: {
          balance: amount,
          totalCredited: amount,
          totalCommission: commissionAmount,
        },
      },
      { new: true },
    );

    return updated || wallet;
  }

  async debitOwner(
    ownerType: WalletOwnerType,
    ownerId: string | Types.ObjectId,
    amount: number,
  ): Promise<WalletDocument | null> {
    const ownerObjectId = typeof ownerId === 'string' ? new Types.ObjectId(ownerId) : ownerId;
    return this.walletModel.findOneAndUpdate(
      { ownerType, ownerId: ownerObjectId, balance: { $gte: amount } },
      {
        $inc: {
          balance: -amount,
          totalDebited: amount,
        },
      },
      { new: true },
    );
  }

  async payoutOwner(
    ownerType: WalletOwnerType,
    ownerId: string | Types.ObjectId,
    amount: number,
  ): Promise<WalletDocument | null> {
    const ownerObjectId = typeof ownerId === 'string' ? new Types.ObjectId(ownerId) : ownerId;
    return this.walletModel.findOneAndUpdate(
      { ownerType, ownerId: ownerObjectId, balance: { $gte: amount } },
      {
        $inc: {
          balance: -amount,
          totalDebited: amount,
          totalPayout: amount,
        },
        $set: { lastPayoutAt: new Date() },
      },
      { new: true },
    );
  }
}
