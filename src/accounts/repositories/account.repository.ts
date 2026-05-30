import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Account } from '../schemas/account.schema';

@Injectable()
export class AccountRepository {
  constructor(
    @InjectModel(Account.name) private readonly model: Model<Account>,
  ) {}

  async findByEmail(email: string): Promise<any> {
    return this.model.findOne({ email: email.toLowerCase() }).lean().exec();
  }

  async findByEmailWithPassword(email: string): Promise<any> {
    return this.model
      .findOne({ email: email.toLowerCase() })
      .select('+passwordHash')
      .exec();
  }

  async findByPhoneNumber(phoneNumber: string): Promise<any> {
    return this.model.findOne({ phoneNumber }).lean().exec();
  }

  async findActiveById(id: string): Promise<any> {
    return this.model.findOne({ _id: id, isActive: true }).lean().exec();
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.model.updateOne(
      { _id: id },
      { $set: { lastLoginAt: new Date() } },
    );
  }
}
