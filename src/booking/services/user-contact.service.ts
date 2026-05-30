import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

export interface UserContact {
  accountId: string;
  fullName?: string;
  phoneNumber?: string;
  email?: string;
}

/**
 * Monolith version: resolves user contact info directly from the shared MongoDB
 * accounts collection. NO HTTP calls.
 */
@Injectable()
export class UserContactService {
  private readonly logger = new Logger(UserContactService.name);

  constructor(
    @InjectModel('Account') private readonly accountModel: Model<any>,
  ) {}

  /**
   * Resolve contact details for a user by accountId.
   * Returns null if user not found.
   */
  async resolveUserContact(accountId: string): Promise<UserContact | null> {
    if (!Types.ObjectId.isValid(accountId)) {
      this.logger.warn(`Invalid accountId: ${accountId}`);
      return null;
    }

    try {
      const account = await this.accountModel
        .findById(accountId, { fullName: 1, phoneNumber: 1, email: 1 })
        .lean()
        .exec() as any;

      if (!account) {
        this.logger.warn(`User ${accountId} not found in accounts collection`);
        return null;
      }

      return {
        accountId,
        fullName: account.fullName,
        phoneNumber: account.phoneNumber,
        email: account.email,
      };
    } catch (error) {
      this.logger.error(`Error resolving user contact for ${accountId}:`, error);
      return null;
    }
  }
}
