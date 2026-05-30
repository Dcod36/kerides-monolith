import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import * as crypto from 'crypto';
import Razorpay = require('razorpay');
import { BookingRepository } from '../repositories/booking.repository';
import { PaymentRepository } from '../repositories/payment.repository';
import { WalletRepository } from '../repositories/wallet.repository';
import { BookingStatus, PaymentMethod, PaymentStatus } from '../schemas/booking.schema';
import { PaymentGateway, PaymentRecordStatus } from '../schemas/payment.schema';
import { WalletOwnerType } from '../schemas/wallet.schema';
import { CreatePaymentOrderDto, SupportedCheckoutMethod } from '../dto/create-payment-order.dto';
import { VerifyPaymentDto } from '../dto/verify-payment.dto';
import { TriggerPayoutDto } from '../dto/trigger-payout.dto';
import { CreateRefundDto } from '../dto/create-refund.dto';

type AdminPaymentFilters = {
  status?: string;
  method?: string;
  gateway?: string;
  bookingId?: string;
  userId?: string;
  driverId?: string;
  from?: string;
  to?: string;
  page?: string;
  limit?: string;
};

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly commissionPercent = Number(process.env.PLATFORM_COMMISSION_PERCENT || 10);
  private readonly razorpayKeyId = process.env.RAZORPAY_KEY_ID || '';
  private readonly razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || '';
  private readonly razorpayWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
  private readonly razorpay?: InstanceType<typeof Razorpay>;

  constructor(
    private readonly bookingRepo: BookingRepository,
    private readonly paymentRepo: PaymentRepository,
    private readonly walletRepo: WalletRepository,
  ) {
    if (this.razorpayKeyId && this.razorpayKeySecret) {
      this.razorpay = new Razorpay({
        key_id: this.razorpayKeyId,
        key_secret: this.razorpayKeySecret,
      });
    }
  }

  private round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private toPaise(valueInRupees: number): number {
    return Math.round(valueInRupees * 100);
  }

  private getActorId(req: any): string {
    return req?.user?.userId || req?.user?.accountId || req?.user?.id || req?.user?.sub;
  }

  private async getBookingForUserPayment(bookingId: string, userId: string): Promise<any> {
    const booking = await this.bookingRepo.findById(bookingId);
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.userId.toString() !== userId) {
      throw new ForbiddenException('You cannot pay for this booking');
    }
    if (booking.status !== BookingStatus.COMPLETED) {
      throw new BadRequestException('Payment can only be initiated after ride completion');
    }
    return booking;
  }

  private async settleDriverEarnings(booking: any, payment: any): Promise<void> {
    if (!booking.driverId) {
      this.logger.warn(`No driver assigned on booking ${booking._id}, skipping settlement`);
      return;
    }

    if (payment.settledToDriver) {
      return;
    }

    const fare = Number(booking.fare || 0);
    const commission = this.round2((fare * this.commissionPercent) / 100);
    const driverEarning = this.round2(fare - commission);

    await this.walletRepo.creditOwner(
      WalletOwnerType.DRIVER,
      booking.driverId,
      driverEarning,
      commission,
    );

    await this.paymentRepo.updateById(payment._id, {
      commissionAmount: commission,
      driverEarningAmount: driverEarning,
      settledToDriver: true,
      settledAt: new Date(),
    });
  }

  private async markBookingPaid(booking: any, paymentTransactionId: string): Promise<void> {
    if (booking.paymentStatus === PaymentStatus.COMPLETED && booking.status === BookingStatus.COMPLETED) {
      return;
    }

    const updates: Record<string, any> = {
      paymentStatus: PaymentStatus.COMPLETED,
      paymentTransactionId,
    };

    if (booking.status !== BookingStatus.COMPLETED) {
      updates.status = BookingStatus.COMPLETED;
      updates.completedAt = new Date();
    }

    await this.bookingRepo.findByIdAndUpdate(booking._id, updates);
  }

  private async markBookingPaymentFailed(bookingId: string | Types.ObjectId): Promise<void> {
    await this.bookingRepo.findByIdAndUpdate(bookingId, {
      paymentStatus: PaymentStatus.FAILED,
    });
  }

  private toObjectId(value?: string): Types.ObjectId | null {
    if (!value) return null;
    if (!Types.ObjectId.isValid(value)) return null;
    return new Types.ObjectId(value);
  }

  private parseDate(value?: string): Date | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }

  private toCsvValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    const raw = String(value);
    if (raw.includes('"') || raw.includes(',') || raw.includes('\n') || raw.includes('\r')) {
      return `"${raw.replace(/"/g, '""')}"`;
    }
    return raw;
  }

  private buildAdminPaymentQuery(filters: AdminPaymentFilters): Record<string, any> {
    const query: Record<string, any> = {};

    if (filters.status) {
      query.status = String(filters.status).toUpperCase();
    }

    if (filters.method) {
      query.method = String(filters.method).toUpperCase();
    }

    if (filters.gateway) {
      query.gateway = String(filters.gateway).toUpperCase();
    }

    const bookingId = this.toObjectId(filters.bookingId);
    if (bookingId) {
      query.bookingId = bookingId;
    }

    const userId = this.toObjectId(filters.userId);
    if (userId) {
      query.userId = userId;
    }

    const driverId = this.toObjectId(filters.driverId);
    if (driverId) {
      query.driverId = driverId;
    }

    const fromDate = this.parseDate(filters.from);
    const toDate = this.parseDate(filters.to);
    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = fromDate;
      if (toDate) query.createdAt.$lte = toDate;
    }

    return query;
  }

  async listPaymentsForAdmin(filters: AdminPaymentFilters) {
    const page = Math.max(1, Math.floor(Number(filters.page) || 1));
    const limit = Math.min(100, Math.max(1, Math.floor(Number(filters.limit) || 20)));
    const query = this.buildAdminPaymentQuery(filters);

    const [payments, total] = await Promise.all([
      this.paymentRepo.findAdminList(query, page, limit),
      this.paymentRepo.countAdminList(query),
    ]);

    return {
      total,
      page,
      limit,
      payments,
    };
  }

  async getPaymentForAdmin(paymentId: string) {
    if (!Types.ObjectId.isValid(paymentId)) {
      throw new BadRequestException('Invalid payment id');
    }

    const payment = await this.paymentRepo.findById(paymentId);
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return payment;
  }

  async exportPaymentsForAdmin(filters: AdminPaymentFilters): Promise<string> {
    const query = this.buildAdminPaymentQuery(filters);
    const payments = await this.paymentRepo.findAdminAll(query);

    const header = [
      'paymentId',
      'bookingId',
      'userId',
      'driverId',
      'amount',
      'currency',
      'method',
      'gateway',
      'status',
      'createdAt',
      'paidAt',
      'refundedAt',
      'refundAmount',
      'commissionAmount',
      'driverEarningAmount',
      'settledToDriver',
    ];

    const rows = payments.map((payment: any) => [
      payment._id,
      payment.bookingId,
      payment.userId,
      payment.driverId,
      payment.amount,
      payment.currency,
      payment.method,
      payment.gateway,
      payment.status,
      payment.createdAt ? new Date(payment.createdAt).toISOString() : '',
      payment.paidAt ? new Date(payment.paidAt).toISOString() : '',
      payment.refundedAt ? new Date(payment.refundedAt).toISOString() : '',
      payment.refundAmount,
      payment.commissionAmount,
      payment.driverEarningAmount,
      payment.settledToDriver,
    ]);

    const lines = [header, ...rows].map((row) => row.map(this.toCsvValue).join(','));
    return lines.join('\n');
  }

  private async getRetryCount(bookingId: string): Promise<number> {
    const latest = await this.paymentRepo.findLatestByBooking(bookingId);
    const retryCount = Number(latest?.metadata?.retryCount || 0);
    return Number.isFinite(retryCount) ? retryCount : 0;
  }

  async createPaymentOrder(userId: string, bookingId: string, dto: CreatePaymentOrderDto): Promise<any> {
    const booking = await this.getBookingForUserPayment(bookingId, userId);
    this.logger.log(`Payment order requested for booking=${bookingId} user=${userId}`);

    const existingPaid = await this.paymentRepo.findCapturedByBooking(bookingId);
    if (existingPaid || booking.paymentStatus === PaymentStatus.COMPLETED) {
      this.logger.log(`Payment already completed for booking=${bookingId}`);
      return {
        message: 'Payment already completed for this ride',
        status: PaymentRecordStatus.CAPTURED,
        paymentId: existingPaid?._id || booking.paymentTransactionId,
      };
    }

    const amount = Number(booking.fare || 0);
    const currency = (dto.currency || 'INR').toUpperCase();
    const paymentMethod = (dto.paymentMethod || SupportedCheckoutMethod.UPI) as SupportedCheckoutMethod;
    const amountInPaise = this.toPaise(amount);
    const receipt = `ride_${String(booking._id).slice(-10)}_${Date.now()}`;
    const retryCount = (await this.getRetryCount(bookingId)) + 1;

    if (paymentMethod === SupportedCheckoutMethod.CASH) {
      const payment = await this.paymentRepo.create({
        bookingId: booking._id,
        userId: booking.userId,
        driverId: booking.driverId,
        amount,
        currency,
        method: PaymentMethod.CASH,
        gateway: PaymentGateway.CASH,
        status: PaymentRecordStatus.PENDING,
        metadata: {
          note: 'Cash payment pending driver confirmation',
        },
      });

      await this.bookingRepo.findByIdAndUpdate(booking._id, {
        paymentMethod: PaymentMethod.CASH,
        paymentStatus: PaymentStatus.PENDING,
      });

      this.logger.log(`Cash payment initiated for booking=${bookingId}`);

      return {
        paymentMode: 'CASH',
        paymentId: payment._id,
        message: 'Cash mode selected. Driver will confirm payment on completion.',
      };
    }

    if (paymentMethod === SupportedCheckoutMethod.WALLET) {
      const userWallet = await this.walletRepo.getOrCreate(WalletOwnerType.USER, booking.userId);
      if (Number(userWallet.balance || 0) < amount) {
        throw new BadRequestException('Insufficient wallet balance');
      }

      const debitedWallet = await this.walletRepo.debitOwner(WalletOwnerType.USER, booking.userId, amount);
      if (!debitedWallet) {
        throw new BadRequestException('Unable to debit wallet. Please try again');
      }

      const payment = await this.paymentRepo.create({
        bookingId: booking._id,
        userId: booking.userId,
        driverId: booking.driverId,
        amount,
        currency,
        method: 'WALLET',
        gateway: PaymentGateway.INTERNAL_WALLET,
        status: PaymentRecordStatus.CAPTURED,
        paidAt: new Date(),
        metadata: { channel: 'internal-wallet' },
      });

      await this.markBookingPaid(booking, String(payment._id));
      await this.settleDriverEarnings(booking, payment);

      this.logger.log(`Wallet payment captured for booking=${bookingId} paymentId=${payment._id}`);

      return {
        paymentMode: 'WALLET',
        status: PaymentRecordStatus.CAPTURED,
        message: 'Paid successfully via wallet',
      };
    }

    if (!this.razorpay) {
      this.logger.warn(`Razorpay not configured; using local demo payment path for booking=${bookingId} method=${paymentMethod}`);
      const payment = await this.paymentRepo.create({
        bookingId: booking._id,
        userId: booking.userId,
        driverId: booking.driverId,
        amount,
        currency,
        method:
          paymentMethod === SupportedCheckoutMethod.UPI
            ? PaymentMethod.UPI
            : paymentMethod === SupportedCheckoutMethod.NETBANKING
            ? PaymentMethod.NETBANKING
            : paymentMethod === SupportedCheckoutMethod.CARD
            ? PaymentMethod.CARD
            : PaymentMethod.CASH,
        gateway: PaymentGateway.RAZORPAY,
        status: PaymentRecordStatus.CAPTURED,
        razorpayOrderId: `MOCK_${paymentMethod}_${Date.now()}`,
        razorpayPaymentId: `MOCK_PAY_${Date.now()}`,
        razorpaySignature: 'MOCK_SIGNATURE',
        receipt,
        paidAt: new Date(),
        metadata: {
          mock: true,
          amountInPaise,
          retryCount,
        },
      });

      await this.markBookingPaid(booking, String(payment._id));
      await this.settleDriverEarnings(booking, payment);

      return {
        paymentMode: 'RAZORPAY',
        keyId: this.razorpayKeyId || 'MOCK_KEY',
        orderId: payment.razorpayOrderId,
        amount: amountInPaise,
        currency,
        bookingId,
        paymentId: payment._id,
        status: payment.status,
        message: 'Local demo payment captured as mock Razorpay transaction',
      };
    }

    try {
      const order = await this.razorpay.orders.create({
        amount: amountInPaise,
        currency,
        receipt,
        payment_capture: true,
        notes: {
          bookingId: String(booking._id),
          userId: String(booking.userId),
        },
      });

      const payment = await this.paymentRepo.create({
        bookingId: booking._id,
        userId: booking.userId,
        driverId: booking.driverId,
        amount,
        currency,
        method: paymentMethod,
        gateway: PaymentGateway.RAZORPAY,
        status: PaymentRecordStatus.CREATED,
        razorpayOrderId: order.id,
        razorpayPaymentId: `PENDING_${order.id}_${Date.now()}`,
        razorpaySignature: `PENDING_SIGNATURE_${order.id}_${Date.now()}`,
        receipt,
        metadata: {
          amountInPaise,
          retryCount,
        },
      });

      await this.bookingRepo.findByIdAndUpdate(booking._id, {
        paymentMethod:
          paymentMethod === SupportedCheckoutMethod.UPI
            ? PaymentMethod.UPI
            : paymentMethod === SupportedCheckoutMethod.NETBANKING
              ? PaymentMethod.NETBANKING
              : PaymentMethod.CARD,
        paymentStatus: PaymentStatus.PENDING,
      });

      this.logger.log(
        `Razorpay order created for booking=${bookingId} orderId=${order.id} amount=${amount} retry=${retryCount}`,
      );

      return {
        paymentMode: 'RAZORPAY',
        keyId: this.razorpayKeyId,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        bookingId,
        paymentId: payment._id,
        status: payment.status,
      };
    } catch (error: unknown) {
      this.logger.error(`Failed to create Razorpay order for booking=${bookingId}`, error as Error);
      throw new BadRequestException('Failed to create payment order. Check Razorpay configuration and retry.');
    }
  }

  private validatePaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
    const payload = `${orderId}|${paymentId}`;
    const expected = crypto
      .createHmac('sha256', this.razorpayKeySecret)
      .update(payload)
      .digest('hex');
    return expected === signature;
  }

  async verifyPayment(userId: string, bookingId: string, dto: VerifyPaymentDto): Promise<any> {
    const booking = await this.getBookingForUserPayment(bookingId, userId);
    this.logger.log(`Verifying payment for booking=${bookingId} orderId=${dto.razorpayOrderId}`);

    const payment = await this.paymentRepo.findByRazorpayOrderId(dto.razorpayOrderId);
    if (!payment || String(payment.bookingId) !== String(booking._id)) {
      throw new NotFoundException('Payment order not found for booking');
    }

    if (payment.status === PaymentRecordStatus.CAPTURED) {
      return { message: 'Payment already verified', status: payment.status };
    }

    const valid = this.validatePaymentSignature(
      dto.razorpayOrderId,
      dto.razorpayPaymentId,
      dto.razorpaySignature,
    );

    if (!valid) {
      await this.paymentRepo.updateById(payment._id, {
        status: PaymentRecordStatus.FAILED,
        errorDescription: 'Signature verification failed',
      });
      await this.markBookingPaymentFailed(booking._id);
      this.logger.warn(`Payment signature verification failed for booking=${bookingId} orderId=${dto.razorpayOrderId}`);
      throw new BadRequestException('Invalid payment signature');
    }

    const updatedPayment = await this.paymentRepo.updateById(payment._id, {
      status: PaymentRecordStatus.CAPTURED,
      razorpayPaymentId: dto.razorpayPaymentId,
      razorpaySignature: dto.razorpaySignature,
      paidAt: new Date(),
    });

    await this.markBookingPaid(booking, dto.razorpayPaymentId);
    if (updatedPayment) {
      await this.settleDriverEarnings(booking, updatedPayment);
    }

    this.logger.log(`Payment verified successfully for booking=${bookingId} paymentId=${dto.razorpayPaymentId}`);

    return {
      message: 'Payment verified and ride marked as paid',
      bookingId,
      paymentStatus: PaymentStatus.COMPLETED,
    };
  }

  async confirmCashPayment(bookingId: string, driverId: string): Promise<any> {
    const booking = await this.bookingRepo.findById(bookingId);
    if (!booking) throw new NotFoundException('Booking not found');
    if (String(booking.driverId || '') !== String(driverId)) {
      throw new ForbiddenException('Only assigned driver can confirm cash payment');
    }
    if (booking.status !== BookingStatus.COMPLETED) {
      throw new BadRequestException('Cash payment can only be confirmed after ride completion');
    }

    let payment = await this.paymentRepo.findLatestByBooking(bookingId);
    if (!payment || payment.gateway !== PaymentGateway.CASH) {
      payment = await this.paymentRepo.create({
        bookingId: booking._id,
        userId: booking.userId,
        driverId: booking.driverId,
        amount: Number(booking.fare || 0),
        currency: 'INR',
        method: PaymentMethod.CASH,
        gateway: PaymentGateway.CASH,
        status: PaymentRecordStatus.CAPTURED,
        paidAt: new Date(),
      });
    } else if (payment.status !== PaymentRecordStatus.CAPTURED) {
      payment = await this.paymentRepo.updateById(payment._id, {
        status: PaymentRecordStatus.CAPTURED,
        paidAt: new Date(),
      });
    }

    await this.markBookingPaid(booking, String(payment?._id || 'cash'));
    if (payment) {
      await this.settleDriverEarnings(booking, payment);
    }

    return {
      message: 'Cash payment confirmed',
      bookingId,
      paymentStatus: PaymentStatus.COMPLETED,
    };
  }

  async getRidePaymentSummary(bookingId: string, actorId: string): Promise<any> {
    const booking = await this.bookingRepo.findById(bookingId);
    if (!booking) throw new NotFoundException('Booking not found');

    const isUser = String(booking.userId) === String(actorId);
    const isDriver = String(booking.driverId || '') === String(actorId);
    if (!isUser && !isDriver) throw new ForbiddenException('Access denied');

    const payment = await this.paymentRepo.findLatestByBooking(bookingId);
    return {
      bookingId,
      fare: booking.fare,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      payment,
      commissionPercent: this.commissionPercent,
    };
  }

  async getDriverWallet(driverId: string): Promise<any> {
    return this.walletRepo.getOrCreate(WalletOwnerType.DRIVER, driverId);
  }

  async triggerDriverPayout(driverId: string, dto: TriggerPayoutDto): Promise<any> {
    const wallet = await this.walletRepo.getOrCreate(WalletOwnerType.DRIVER, driverId);
    const available = Number(wallet.balance || 0);
    const amount = this.round2(dto.amount ?? available);

    if (amount <= 0) {
      throw new BadRequestException('No wallet balance available for payout');
    }
    if (amount > available) {
      throw new BadRequestException('Requested payout exceeds wallet balance');
    }

    const updatedWallet = await this.walletRepo.payoutOwner(WalletOwnerType.DRIVER, driverId, amount);
    if (!updatedWallet) {
      throw new BadRequestException('Payout failed. Please retry.');
    }

    const payoutReference = `manual_payout_${Date.now()}`;
    return {
      message: 'Payout marked successfully (manual settlement mode)',
      payoutReference,
      amount,
      destination: dto.upiId || wallet.upiId || 'BANK_TRANSFER',
      wallet: updatedWallet,
    };
  }

  async createRefund(userId: string, bookingId: string, dto: CreateRefundDto): Promise<any> {
    const booking = await this.getBookingForUserPayment(bookingId, userId);
    if (booking.paymentStatus !== PaymentStatus.COMPLETED) {
      throw new BadRequestException('Only paid rides can be refunded');
    }

    const payment = await this.paymentRepo.findCapturedByBooking(bookingId);
    if (!payment) {
      throw new NotFoundException('Paid transaction not found');
    }

    const refundAmount = this.round2(dto.amount ?? Number(payment.amount || 0));
    if (refundAmount <= 0 || refundAmount > Number(payment.amount || 0)) {
      throw new BadRequestException('Invalid refund amount');
    }

    // Reverse previously settled driver earnings before processing refund.
    if (payment.settledToDriver && Number(payment.driverEarningAmount || 0) > 0 && payment.driverId) {
      const reversedWallet = await this.walletRepo.debitOwner(
        WalletOwnerType.DRIVER,
        payment.driverId,
        Number(payment.driverEarningAmount || 0),
      );

      if (!reversedWallet) {
        throw new BadRequestException(
          'Unable to reverse settled driver earnings. Process payout reconciliation before refund.',
        );
      }
    }

    if (payment.gateway === PaymentGateway.RAZORPAY && payment.razorpayPaymentId && this.razorpay) {
      await this.razorpay.payments.refund(payment.razorpayPaymentId, {
        amount: this.toPaise(refundAmount),
        notes: {
          reason: dto.reason || 'Customer requested refund',
          bookingId,
        },
      });
    }

    await this.paymentRepo.updateById(payment._id, {
      status: PaymentRecordStatus.REFUNDED,
      refundedAt: new Date(),
      refundAmount,
      settledToDriver: false,
      settledAt: null,
      driverEarningAmount: 0,
      commissionAmount: 0,
      metadata: {
        ...(payment.metadata || {}),
        refundReason: dto.reason || null,
      },
    });

    await this.bookingRepo.findByIdAndUpdate(booking._id, {
      paymentStatus: PaymentStatus.REFUNDED,
    });

    return {
      message: 'Refund initiated successfully',
      bookingId,
      refundAmount,
    };
  }

  private verifyWebhookSignature(rawBody: Buffer | string, signature: string): boolean {
    if (!this.razorpayWebhookSecret) return false;
    const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
    const expected = crypto
      .createHmac('sha256', this.razorpayWebhookSecret)
      .update(body)
      .digest('hex');
    this.logger.debug(`Webhook signature verification attempted. signaturePresent=${Boolean(signature)}`);
    return expected === signature;
  }

  async handleRazorpayWebhook(rawBody: Buffer | string, signature: string, eventId?: string): Promise<any> {
    this.logger.log('Razorpay webhook received');

    if (!signature) {
      this.logger.warn('Webhook rejected: missing x-razorpay-signature header');
      throw new BadRequestException('Missing webhook signature');
    }

    if (!this.verifyWebhookSignature(rawBody, signature)) {
      this.logger.warn('Webhook rejected: invalid signature');
      throw new BadRequestException('Invalid webhook signature');
    }

    if (eventId) {
      const alreadyProcessed = await this.paymentRepo.findByWebhookEventId(eventId);
      if (alreadyProcessed) {
        this.logger.log(`Webhook ignored: duplicate event id ${eventId}`);
        return { received: true, duplicate: true };
      }
    }

    const payload = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody);
    const event = payload?.event;
    this.logger.log(`Processing webhook event=${event || 'unknown'}`);

    if (event === 'payment.captured') {
      const paymentEntity = payload?.payload?.payment?.entity;
      const orderId = paymentEntity?.order_id;
      const paymentId = paymentEntity?.id;
      if (!orderId || !paymentId) {
        this.logger.warn('payment.captured ignored: missing order_id or payment id');
        return { received: true, ignored: true };
      }

      const payment = await this.paymentRepo.findByRazorpayOrderId(orderId);
      if (!payment) {
        this.logger.warn(`payment.captured ignored: no payment record for orderId=${orderId}`);
        return { received: true, ignored: true };
      }

      if (payment.status !== PaymentRecordStatus.CAPTURED) {
        const updated = await this.paymentRepo.updateById(payment._id, {
          status: PaymentRecordStatus.CAPTURED,
          razorpayPaymentId: paymentId,
          paidAt: new Date(),
          webhookEventId: eventId || payload?.account_id || null,
          method: paymentEntity.method || payment.method,
        });

        const booking = await this.bookingRepo.findById(String(payment.bookingId));
        if (booking && updated) {
          await this.markBookingPaid(booking, paymentId);
          await this.settleDriverEarnings(booking, updated);
          this.logger.log(`payment.captured applied for booking=${booking._id} orderId=${orderId} paymentId=${paymentId}`);
        }
      }
    }

    if (event === 'order.paid') {
      const orderEntity = payload?.payload?.order?.entity;
      const paymentEntity = payload?.payload?.payment?.entity;
      const orderId = orderEntity?.id || paymentEntity?.order_id;
      const paymentId = paymentEntity?.id;

      if (!orderId || !paymentId) {
        this.logger.warn('order.paid ignored: missing order id or payment id');
        return { received: true, ignored: true };
      }

      const payment = await this.paymentRepo.findByRazorpayOrderId(orderId);
      if (!payment) {
        this.logger.warn(`order.paid ignored: no payment record for orderId=${orderId}`);
        return { received: true, ignored: true };
      }

      if (payment.status !== PaymentRecordStatus.CAPTURED) {
        const updated = await this.paymentRepo.updateById(payment._id, {
          status: PaymentRecordStatus.CAPTURED,
          razorpayPaymentId: paymentId,
          paidAt: new Date(),
          webhookEventId: eventId || payload?.account_id || null,
          method: paymentEntity?.method || payment.method,
        });

        const booking = await this.bookingRepo.findById(String(payment.bookingId));
        if (booking && updated) {
          await this.markBookingPaid(booking, paymentId);
          await this.settleDriverEarnings(booking, updated);
          this.logger.log(`order.paid applied for booking=${booking._id} orderId=${orderId} paymentId=${paymentId}`);
        }
      }
    }

    if (event === 'payment.failed') {
      const paymentEntity = payload?.payload?.payment?.entity;
      const orderId = paymentEntity?.order_id;
      if (orderId) {
        const payment = await this.paymentRepo.findByRazorpayOrderId(orderId);
        if (payment) {
          if (
            payment.status === PaymentRecordStatus.CAPTURED ||
            payment.status === PaymentRecordStatus.REFUNDED
          ) {
            this.logger.warn(
              `payment.failed ignored for terminal payment state orderId=${orderId} status=${payment.status}`,
            );
            return { received: true, ignored: true };
          }

          await this.paymentRepo.updateById(payment._id, {
            status: PaymentRecordStatus.FAILED,
            errorCode: paymentEntity?.error_code || null,
            errorDescription: paymentEntity?.error_description || 'Payment failed',
            webhookEventId: eventId || payment.webhookEventId || null,
          });
          await this.markBookingPaymentFailed(payment.bookingId);
          this.logger.warn(`payment.failed applied for orderId=${orderId} code=${paymentEntity?.error_code || 'NA'}`);
        }
      }
    }

    return { received: true };
  }
}
