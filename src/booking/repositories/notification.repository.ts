import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Notification,
  NotificationDocument,
  NotificationStatus,
} from '../schemas/notification.schema';

@Injectable()
export class NotificationRepository {
  constructor(
    @InjectModel(Notification.name) private readonly notificationModel: Model<NotificationDocument>,
  ) {}

  async create(notificationData: Partial<Notification>): Promise<NotificationDocument> {
    const notification = new this.notificationModel(notificationData);
    return notification.save();
  }

  async findById(id: string | Types.ObjectId): Promise<NotificationDocument | null> {
    return this.notificationModel.findById(id).exec();
  }

  async findByRecipientId(recipientId: string | Types.ObjectId): Promise<NotificationDocument[]> {
    return this.notificationModel
      .find({ recipientId })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByBookingId(bookingId: string | Types.ObjectId): Promise<NotificationDocument[]> {
    return this.notificationModel
      .find({ bookingId })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findPendingNotifications(): Promise<NotificationDocument[]> {
    return this.notificationModel
      .find({
        status: { $in: [NotificationStatus.PENDING, NotificationStatus.RETRYING] },
        $or: [
          { nextRetryAt: null },
          { nextRetryAt: { $lte: new Date() } },
        ],
      })
      .sort({ createdAt: 1 })
      .limit(100)
      .exec();
  }

  async markAsSent(id: string | Types.ObjectId): Promise<NotificationDocument | null> {
    return this.notificationModel
      .findByIdAndUpdate(
        id,
        {
          status: NotificationStatus.SENT,
          sentAt: new Date(),
        },
        { new: true },
      )
      .exec();
  }

  async markAsFailed(
    id: string | Types.ObjectId,
    errorMessage: string,
    retryCount: number,
  ): Promise<NotificationDocument | null> {
    const maxRetries = 3;
    const nextRetryAt = retryCount < maxRetries
      ? new Date(Date.now() + Math.pow(2, retryCount) * 60000)
      : null;

    return this.notificationModel
      .findByIdAndUpdate(
        id,
        {
          status: retryCount < maxRetries ? NotificationStatus.RETRYING : NotificationStatus.FAILED,
          errorMessage,
          retryCount,
          nextRetryAt,
        },
        { new: true },
      )
      .exec();
  }

  async deleteOlderThan(days: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await this.notificationModel
      .deleteMany({
        createdAt: { $lt: cutoffDate },
        status: NotificationStatus.SENT,
      })
      .exec();

    return result.deletedCount || 0;
  }
}
