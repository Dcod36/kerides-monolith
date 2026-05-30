import {
  Controller,
  Get,
  Sse,
  UseGuards,
  Request,
  MessageEvent,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Observable, interval } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { BookingService } from '../services/booking.service';

@ApiTags('Ride Requests')
@Controller('ride-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class RideRequestController {
  constructor(private readonly bookingService: BookingService) {}

  private getActorId(req: any): string {
    return req?.user?.userId || req?.user?.accountId || req?.user?.id || req?.user?.sub;
  }

  @Get('pending')
  @Roles('DRIVER')
  @ApiOperation({ summary: 'Get pending ride requests for the authenticated driver' })
  @ApiResponse({ status: 200, description: 'Pending ride requests retrieved' })
  async getPendingRideRequests(@Request() req: any) {
    return this.bookingService.getPendingRideRequestsForDriver(this.getActorId(req));
  }

  @Sse('stream')
  @Roles('DRIVER')
  @ApiOperation({
    summary: 'Server-Sent Events stream for real-time ride notifications (driver only)',
    description:
      'Establishes a persistent SSE connection that pushes new ride requests to drivers in real-time. ' +
      'The stream sends updates every 5 seconds with pending ride requests.',
  })
  @ApiResponse({
    status: 200,
    description: 'SSE stream established. Events are sent in JSON format.',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Driver role required' })
  streamRideRequests(@Request() req: any): Observable<MessageEvent> {
    const driverId = this.getActorId(req);

    // Poll for pending ride requests every 5 seconds
    return interval(5000).pipe(
      switchMap(async () => {
        try {
          const result = await this.bookingService.getPendingRideRequestsForDriver(
            driverId,
          );
          return result;
        } catch (error) {
          console.error('Error fetching ride requests:', error);
          return { count: 0, requests: [] };
        }
      }),
      map((data) => ({
        data,
        type: 'ride-request-update',
      })),
    );
  }
}
