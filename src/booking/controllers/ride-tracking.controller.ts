import {
  Controller,
  Get,
  MessageEvent,
  Param,
  Post,
  Body,
  Request,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Observable, interval } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RideTrackingService } from '../services/ride-tracking.service';
import { UpdateRideLocationDto } from '../dto/update-ride-location.dto';

@ApiTags('Ride Tracking')
@Controller('bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class RideTrackingController {
  constructor(private readonly rideTrackingService: RideTrackingService) {}

  private getActorId(req: any): string {
    return req?.user?.userId || req?.user?.accountId || req?.user?.id || req?.user?.sub;
  }

  @Post(':bookingId/location')
  @Roles('DRIVER')
  @ApiOperation({ summary: 'Driver updates live location during IN_PROGRESS ride' })
  @ApiResponse({ status: 201, description: 'Location updated' })
  async updateDriverLocation(
    @Param('bookingId') bookingId: string,
    @Body() dto: UpdateRideLocationDto,
    @Request() req: any,
  ) {
    return this.rideTrackingService.updateDriverLocation(bookingId, this.getActorId(req), dto);
  }

  @Get(':bookingId/location')
  @Roles('USER', 'DRIVER')
  @ApiOperation({ summary: 'Get latest ride location for user/driver' })
  @ApiResponse({ status: 200, description: 'Location fetched' })
  async getRideLocation(
    @Param('bookingId') bookingId: string,
    @Request() req: any,
  ) {
    return this.rideTrackingService.getRideLocation(bookingId, this.getActorId(req));
  }

  @Sse(':bookingId/location/stream')
  @Roles('USER', 'DRIVER')
  @ApiOperation({ summary: 'SSE stream for live ride location updates' })
  streamRideLocation(
    @Param('bookingId') bookingId: string,
    @Request() req: any,
  ): Observable<MessageEvent> {
    const actorId = this.getActorId(req);

    return interval(3000).pipe(
      switchMap(async () => this.rideTrackingService.getRideLocation(bookingId, actorId)),
      map((data) => ({ data, type: 'ride-location-update' })),
    );
  }
}
