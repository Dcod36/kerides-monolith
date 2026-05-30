import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { PaymentService } from '../services/payment.service';

@ApiTags('Admin Payments')
@ApiBearerAuth()
@Controller('admin/payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminPaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List payments for admin' })
  @ApiResponse({ status: 200, description: 'Payments fetched successfully' })
  async listPayments(
    @Query('status') status?: string,
    @Query('method') method?: string,
    @Query('gateway') gateway?: string,
    @Query('bookingId') bookingId?: string,
    @Query('userId') userId?: string,
    @Query('driverId') driverId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.paymentService.listPaymentsForAdmin({
      status,
      method,
      gateway,
      bookingId,
      userId,
      driverId,
      from,
      to,
      page,
      limit,
    });
  }

  @Get('export')
  @Roles('ADMIN')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="payments.csv"')
  @ApiOperation({ summary: 'Export payments CSV' })
  async exportPayments(
    @Query('status') status?: string,
    @Query('method') method?: string,
    @Query('gateway') gateway?: string,
    @Query('bookingId') bookingId?: string,
    @Query('userId') userId?: string,
    @Query('driverId') driverId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.paymentService.exportPaymentsForAdmin({
      status,
      method,
      gateway,
      bookingId,
      userId,
      driverId,
      from,
      to,
    });
  }

  @Get(':paymentId')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get payment by id (admin)' })
  @ApiResponse({ status: 200, description: 'Payment fetched successfully' })
  async getPayment(@Param('paymentId') paymentId: string) {
    return this.paymentService.getPaymentForAdmin(paymentId);
  }
}
