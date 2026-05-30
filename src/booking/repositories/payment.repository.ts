import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Payment, PaymentDocument, PaymentRecordStatus } from '../schemas/payment.schema';

@Injectable()
export class PaymentRepository {
  constructor(
    @InjectModel(Payment.name) private readonly paymentModel: Model<PaymentDocument>,
  ) {}

  async create(data: Partial<Payment>): Promise<PaymentDocument> {
    const payment = new this.paymentModel(data);
    return payment.save();
  }

  async findById(id: string | Types.ObjectId): Promise<PaymentDocument | null> {
    return this.paymentModel.findById(id).exec();
  }

  async findLatestByBooking(bookingId: string | Types.ObjectId): Promise<PaymentDocument | null> {
    return this.paymentModel.findOne({ bookingId }).sort({ createdAt: -1 }).exec();
  }

  async findCapturedByBooking(bookingId: string | Types.ObjectId): Promise<PaymentDocument | null> {
    return this.paymentModel
      .findOne({ bookingId, status: PaymentRecordStatus.CAPTURED })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByRazorpayOrderId(orderId: string): Promise<PaymentDocument | null> {
    return this.paymentModel.findOne({ razorpayOrderId: orderId }).exec();
  }

  async findByRazorpayPaymentId(paymentId: string): Promise<PaymentDocument | null> {
    return this.paymentModel.findOne({ razorpayPaymentId: paymentId }).exec();
  }

  async findByWebhookEventId(webhookEventId: string): Promise<PaymentDocument | null> {
    return this.paymentModel.findOne({ webhookEventId }).exec();
  }

  async updateById(id: string | Types.ObjectId, update: Partial<Payment>): Promise<PaymentDocument | null> {
    return this.paymentModel.findByIdAndUpdate(id, update, { new: true }).exec();
  }

  async findAdminList(query: Record<string, any>, page: number, limit: number): Promise<any[]> {
    const skip = (page - 1) * limit;
    return this.paymentModel
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();
  }

  async countAdminList(query: Record<string, any>): Promise<number> {
    return this.paymentModel.countDocuments(query).exec();
  }

  async findAdminAll(query: Record<string, any>): Promise<any[]> {
    return this.paymentModel
      .find(query)
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }
}
