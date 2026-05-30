import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { PaymentService } from '../services/payment.service';
import { CreatePaymentOrderDto } from '../dto/create-payment-order.dto';
import { VerifyPaymentDto } from '../dto/verify-payment.dto';
import { TriggerPayoutDto } from '../dto/trigger-payout.dto';
import { CreateRefundDto } from '../dto/create-refund.dto';

@ApiTags('Payments')
@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  private getActorId(req: any): string {
    return req?.user?.userId || req?.user?.accountId || req?.user?.id || req?.user?.sub;
  }

  @Post('bookings/:bookingId/order')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create payment order for completed ride' })
  @ApiResponse({ status: 201, description: 'Payment order created' })
  async createOrder(
    @Param('bookingId') bookingId: string,
    @Body() dto: CreatePaymentOrderDto,
    @Req() req: any,
  ) {
    return this.paymentService.createPaymentOrder(this.getActorId(req), bookingId, dto);
  }

  @Post('bookings/:bookingId/verify')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify Razorpay payment signature and finalize ride payment' })
  @ApiResponse({ status: 200, description: 'Payment verified successfully' })
  async verifyPayment(
    @Param('bookingId') bookingId: string,
    @Body() dto: VerifyPaymentDto,
    @Req() req: any,
  ) {
    return this.paymentService.verifyPayment(this.getActorId(req), bookingId, dto);
  }

  @Post('bookings/:bookingId/cash/confirm')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DRIVER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Driver confirms cash payment collected' })
  @ApiResponse({ status: 200, description: 'Cash payment confirmed' })
  async confirmCashPayment(
    @Param('bookingId') bookingId: string,
    @Req() req: any,
  ) {
    return this.paymentService.confirmCashPayment(bookingId, this.getActorId(req));
  }

  @Get('bookings/:bookingId/summary')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER', 'DRIVER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get booking payment summary and transaction state' })
  async getPaymentSummary(
    @Param('bookingId') bookingId: string,
    @Req() req: any,
  ) {
    return this.paymentService.getRidePaymentSummary(bookingId, this.getActorId(req));
  }

  @Get('wallets/driver/me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DRIVER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get authenticated driver wallet balance' })
  async getDriverWallet(@Req() req: any) {
    return this.paymentService.getDriverWallet(this.getActorId(req));
  }

  @Post('wallets/driver/payout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DRIVER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Trigger manual driver payout from wallet' })
  async triggerPayout(@Req() req: any, @Body() dto: TriggerPayoutDto) {
    return this.paymentService.triggerDriverPayout(this.getActorId(req), dto);
  }

  @Post('bookings/:bookingId/refund')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('USER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initiate refund for paid booking' })
  async createRefund(
    @Param('bookingId') bookingId: string,
    @Req() req: any,
    @Body() dto: CreateRefundDto,
  ) {
    return this.paymentService.createRefund(this.getActorId(req), bookingId, dto);
  }

  @Post(['webhooks/razorpay', 'verify-webhook'])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Razorpay webhook endpoint (signature-verified)' })
  async razorpayWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-razorpay-signature') signature: string,
    @Headers('x-razorpay-event-id') eventId?: string,
  ) {
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
    return this.paymentService.handleRazorpayWebhook(rawBody, signature, eventId);
  }
}
