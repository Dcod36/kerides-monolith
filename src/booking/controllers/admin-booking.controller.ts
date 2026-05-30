import {
  Controller,
  Get,
  Header,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { BookingService } from '../services/booking.service';
import { AdminCancelBookingDto } from '../dto/admin/admin-cancel-booking.dto';
import { AdminAssignDriverDto } from '../dto/admin/admin-assign-driver.dto';

@ApiTags('Admin Bookings')
@ApiBearerAuth()
@Controller('admin/bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminBookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List bookings for admin' })
  @ApiResponse({ status: 200, description: 'Bookings fetched successfully' })
  async listBookings(
    @Query('status') status?: string,
    @Query('userId') userId?: string,
    @Query('driverId') driverId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.bookingService.listBookingsForAdmin({
      status,
      userId,
      driverId,
      page,
      limit,
    });
  }

  @Get('export')
  @Roles('ADMIN')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="bookings.csv"')
  @ApiOperation({ summary: 'Export bookings CSV (admin)' })
  async exportBookings(
    @Query('status') status?: string,
    @Query('userId') userId?: string,
    @Query('driverId') driverId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.bookingService.exportBookingsForAdmin({
      status,
      userId,
      driverId,
      from,
      to,
    });
  }

  @Get(':bookingId')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get booking by id (admin)' })
  @ApiResponse({ status: 200, description: 'Booking fetched successfully' })
  async getBooking(@Param('bookingId') bookingId: string) {
    return this.bookingService.getBookingByIdAdmin(bookingId);
  }

  @Patch(':bookingId/cancel')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel booking (admin)' })
  @ApiResponse({ status: 200, description: 'Booking cancelled successfully' })
  async cancelBooking(
    @Param('bookingId') bookingId: string,
    @Body() body: AdminCancelBookingDto,
  ) {
    return this.bookingService.cancelBookingByAdmin(bookingId, body.reason);
  }

  @Patch(':bookingId/assign-driver')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assign driver to booking (admin)' })
  @ApiResponse({ status: 200, description: 'Driver assigned successfully' })
  async assignDriver(
    @Param('bookingId') bookingId: string,
    @Body() body: AdminAssignDriverDto,
  ) {
    return this.bookingService.assignDriverByAdmin(bookingId, body.driverId);
  }
}
