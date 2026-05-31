import {
  Controller,
  Get,
  Post,
  Param,
  Request,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { BookingService } from '../services/booking.service';
import { RideTrackingService } from '../services/ride-tracking.service';

/**
 * Alias controller that mirrors the frontend's legacy /api/rides/* URLs.
 *
 * The frontend (built for the old microservices driver-service) calls:
 *   POST /api/rides/:id/reject
 *   GET  /api/rides/:id/driver-location
 *
 * Rather than changing the frontend, this controller registers the same
 * paths and delegates to the same service methods as BookingController
 * and RideTrackingController.
 */
@ApiTags('Rides (Alias)')
@Controller('api/rides')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class RidesAliasController {
  constructor(
    private readonly bookingService: BookingService,
    private readonly rideTrackingService: RideTrackingService,
  ) {}

  private getActorId(req: any): string {
    return req?.user?.userId || req?.user?.accountId || req?.user?.id || req?.user?.sub;
  }

  // ─── POST /api/rides/:rideId/reject ──────────────────────────────────────────
  // Called by: bookingService.tsx, useDriverRideListener.ts, DriverBookingsTab.tsx, DriverProfile.tsx
  @Post(':rideId/reject')
  @Roles('DRIVER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Alias] Reject a ride — delegates to /bookings/:id/reject' })
  @ApiParam({ name: 'rideId', description: 'Booking / Ride ID' })
  @ApiResponse({ status: 200, description: 'Ride rejected' })
  async rejectRide(@Param('rideId') rideId: string, @Request() req: any) {
    return this.bookingService.rejectBooking(rideId, this.getActorId(req));
  }

  // ─── GET /api/rides/:rideId/driver-location ───────────────────────────────────
  // Called by: bookingService.tsx L387
  @Get(':rideId/driver-location')
  @Roles('USER', 'DRIVER')
  @ApiOperation({ summary: '[Alias] Get driver location — delegates to /bookings/:id/location' })
  @ApiParam({ name: 'rideId', description: 'Booking / Ride ID' })
  @ApiResponse({ status: 200, description: 'Driver location fetched' })
  async getDriverLocation(@Param('rideId') rideId: string, @Request() req: any) {
    return this.rideTrackingService.getRideLocation(rideId, this.getActorId(req));
  }
}
