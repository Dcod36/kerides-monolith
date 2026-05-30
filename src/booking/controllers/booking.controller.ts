import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { BookingService } from '../services/booking.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CreateBookingDto } from '../dto/create-booking.dto';
import { UpdateBookingStatusDto } from '../dto/update-booking-status.dto';
import { VerifyOtpDto } from '../dto/verify-otp.dto';
import { EstimateFareDto } from '../dto/estimate-fare.dto';
import { FindNearbyDriversDto } from '../dto/find-nearby-drivers.dto';
import { RateBookingDto } from '../dto/rate-booking.dto';
import { Types } from 'mongoose';
import { BookingStatus } from '../schemas/booking.schema';

@ApiTags('Bookings')
@Controller('bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  private parsePaginationValue(
    value: string | undefined,
    fallback: number,
    min: number,
    max: number,
  ): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(parsed)));
  }

  private getActorId(req: any): string {
    return req?.user?.userId || req?.user?.accountId || req?.user?.id || req?.user?.sub;
  }

  @Post()
  @Throttle({ default: { limit: 30, ttl: 60 } })
  @UseGuards(ThrottlerGuard)
  @Roles('USER')
  @ApiOperation({ summary: 'Create a new booking (ride request)' })
  @ApiResponse({ status: 201, description: 'Booking created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createBooking(@Request() req: any, @Body() createBookingDto: CreateBookingDto) {
    return this.bookingService.createBooking(
      this.getActorId(req),
      createBookingDto,
    );
  }

  @Post('estimate-fare')
  @Throttle({ default: { limit: 60, ttl: 60 } })
  @UseGuards(ThrottlerGuard)
  @Roles('USER', 'DRIVER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Estimate fare for a trip' })
  @ApiResponse({ status: 200, description: 'Fare estimated successfully' })
  async estimateFare(@Body() estimateFareDto: EstimateFareDto) {
    return this.bookingService.estimateFare(estimateFareDto);
  }

  @Get('nearby-drivers')
  @Throttle({ default: { limit: 60, ttl: 60 } })
  @UseGuards(ThrottlerGuard)
  @Roles('USER')
  @ApiOperation({ summary: 'Find nearby available drivers' })
  @ApiResponse({ status: 200, description: 'Nearby drivers retrieved' })
  async findNearbyDrivers(@Query() findNearbyDriversDto: FindNearbyDriversDto) {
    return this.bookingService.findNearbyDrivers(
      findNearbyDriversDto,
    );
  }

  @Get('my-bookings')
  @Roles('USER')
  @ApiOperation({ summary: 'Get all bookings for the authenticated user' })
  @ApiResponse({ status: 200, description: 'User bookings retrieved' })
  async getUserBookings(
    @Request() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.bookingService.getUserBookings(
      this.getActorId(req),
      this.parsePaginationValue(page, 1, 1, 10000),
      this.parsePaginationValue(limit, 10, 1, 100),
    );
  }

  @Get('driver/my-bookings')
  @Roles('DRIVER')
  @ApiOperation({ summary: 'Get all bookings for the authenticated driver' })
  @ApiResponse({ status: 200, description: 'Driver bookings retrieved' })
  async getDriverBookings(
    @Request() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.bookingService.getDriverBookings(
      this.getActorId(req),
      this.parsePaginationValue(page, 1, 1, 10000),
      this.parsePaginationValue(limit, 10, 1, 100),
    );
  }

  @Get('driver/active')
  @Roles('DRIVER')
  @ApiOperation({ summary: 'Get current active booking for the authenticated driver' })
  @ApiResponse({ status: 200, description: 'Driver active booking retrieved' })
  async getDriverActiveBooking(@Request() req: any) {
    return this.bookingService.getDriverActiveBooking(this.getActorId(req));
  }

  @Get('pending')
  @Roles('DRIVER')
  @ApiOperation({ summary: 'Get all pending bookings (available rides)' })
  @ApiResponse({ status: 200, description: 'Pending bookings retrieved' })
  async getPendingBookings() {
    return this.bookingService.getPendingBookings();
  }

  @Get(':bookingId')
  @Roles('USER', 'DRIVER')
  @ApiOperation({ summary: 'Get booking details by ID' })
  @ApiParam({ name: 'bookingId', description: 'Booking ID' })
  @ApiResponse({ status: 200, description: 'Booking retrieved' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  async getBookingById(@Param('bookingId') bookingId: string, @Request() req: any) {
    if (!Types.ObjectId.isValid(bookingId)) {
      throw new BadRequestException('Invalid booking id');
    }
    return this.bookingService.getBookingById(bookingId, this.getActorId(req));
  }

  @Patch(':bookingId/status')
  @Roles('USER', 'DRIVER')
  @ApiOperation({ summary: 'Update booking status' })
  @ApiParam({ name: 'bookingId', description: 'Booking ID' })
  @ApiBody({ type: UpdateBookingStatusDto })
  @ApiResponse({ status: 200, description: 'Booking status updated' })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  async updateBookingStatus(
    @Param('bookingId') bookingId: string,
    @Body() updateStatusDto: UpdateBookingStatusDto,
    @Request() req: any,
  ) {
    return this.bookingService.updateBookingStatus(
      bookingId,
      updateStatusDto,
      this.getActorId(req),
    );
  }

  @Post(':bookingId/accept')
  @Roles('DRIVER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept a booking (driver only)' })
  @ApiParam({ name: 'bookingId', description: 'Booking ID' })
  @ApiResponse({ status: 200, description: 'Booking accepted' })
  @ApiResponse({ status: 400, description: 'Booking no longer available' })
  async acceptBooking(@Param('bookingId') bookingId: string, @Request() req: any) {
    return this.bookingService.acceptBooking(bookingId, this.getActorId(req));
  }

  @Post(':bookingId/reject')
  @Roles('DRIVER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a booking (driver only)' })
  @ApiParam({ name: 'bookingId', description: 'Booking ID' })
  @ApiResponse({ status: 200, description: 'Booking rejected' })
  async rejectBooking(@Param('bookingId') bookingId: string, @Request() req: any) {
    return this.bookingService.rejectBooking(
      bookingId,
      this.getActorId(req),
    );
  }

  @Post(':bookingId/driver-arrived')
  @Roles('DRIVER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark driver as arrived at pickup location (driver only)' })
  @ApiParam({ name: 'bookingId', description: 'Booking ID' })
  @ApiResponse({ status: 200, description: 'Driver arrival marked, user notified' })
  @ApiResponse({ status: 400, description: 'Booking must be accepted first' })
  async driverArrived(@Param('bookingId') bookingId: string, @Request() req: any) {
    return this.bookingService.markDriverArrived(bookingId, this.getActorId(req));
  }

  @Post(':bookingId/generate-otp')
  @Roles('USER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Regenerate OTP for ride start (user only, if new OTP needed)' })
  @ApiParam({ name: 'bookingId', description: 'Booking ID' })
  @ApiResponse({ status: 200, description: 'New OTP sent to user email' })
  @ApiResponse({ status: 400, description: 'OTP can only be generated when driver is assigned or arrived' })
  async generateOtp(@Param('bookingId') bookingId: string, @Request() req: any) {
    return this.bookingService.generateOtp(bookingId, this.getActorId(req));
  }

  @Post(':bookingId/verify-otp')
  @Roles('DRIVER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP and START ride (driver only)' })
  @ApiParam({ name: 'bookingId', description: 'Booking ID' })
  @ApiBody({ type: VerifyOtpDto })
  @ApiResponse({ status: 200, description: 'OTP verified, ride started (IN_PROGRESS)' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  async verifyOtp(
    @Param('bookingId') bookingId: string,
    @Body() verifyOtpDto: VerifyOtpDto,
    @Request() req: any,
  ) {
    return this.bookingService.verifyOtpAndComplete(
      bookingId,
      verifyOtpDto,
      this.getActorId(req),
    );
  }

  @Post(':bookingId/complete')
  @Roles('DRIVER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete ride after reaching destination (driver only)' })
  @ApiParam({ name: 'bookingId', description: 'Booking ID' })
  @ApiResponse({ status: 200, description: 'Ride completed' })
  @ApiResponse({ status: 400, description: 'Ride must be in progress to complete' })
  async completeRide(@Param('bookingId') bookingId: string, @Request() req: any) {
    return this.bookingService.completeRide(bookingId, this.getActorId(req));
  }

  @Post(':bookingId/rate')
  @Roles('USER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rate a completed booking (user only)' })
  @ApiParam({ name: 'bookingId', description: 'Booking ID' })
  @ApiBody({ type: RateBookingDto })
  @ApiResponse({ status: 200, description: 'Booking rated successfully' })
  @ApiResponse({ status: 400, description: 'Can only rate completed bookings' })
  async rateBooking(
    @Param('bookingId') bookingId: string,
    @Body() rateBookingDto: RateBookingDto,
    @Request() req: any,
  ) {
    return this.bookingService.rateBooking(bookingId, rateBookingDto, this.getActorId(req));
  }

  @Patch(':bookingId/arrived')
  @Roles('DRIVER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark driver as arrived at pickup location (driver only)' })
  @ApiParam({ name: 'bookingId', description: 'Booking ID' })
  @ApiResponse({ status: 200, description: 'Driver arrival marked, user notified' })
  async driverArrivedPatch(@Param('bookingId') bookingId: string, @Request() req: any) {
    return this.bookingService.markDriverArrived(bookingId, this.getActorId(req));
  }

  @Patch(':bookingId/cancel')
  @Roles('USER', 'DRIVER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel booking' })
  @ApiParam({ name: 'bookingId', description: 'Booking ID' })
  @ApiResponse({ status: 200, description: 'Booking cancelled' })
  async cancelBooking(
    @Param('bookingId') bookingId: string,
    @Request() req: any,
    @Body('cancelReason') cancelReason?: string,
  ) {
    return this.bookingService.updateBookingStatus(
      bookingId,
      { status: BookingStatus.CANCELLED, cancelReason: cancelReason || 'Cancelled by user/driver' },
      this.getActorId(req),
    );
  }
}
