import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Drivers (Fallback)')
@Controller('drivers')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class DriversController {
  constructor(
    @InjectModel('DriverProfile') private readonly driverProfileModel: Model<any>,
  ) {}

  private getActorId(req: any): string {
    return req?.user?.userId || req?.user?.accountId || req?.user?.id || req?.user?.sub;
  }

  @Post('location/update')
  @Roles('DRIVER')
  @ApiOperation({ summary: 'Update location fallback endpoint' })
  async updateLocation(@Request() req: any, @Body() body: any) {
    const accountId = this.getActorId(req);
    const { latitude, longitude, lat, lng, isOnline } = body;

    const finalLat = typeof latitude === 'number' ? latitude : lat;
    const finalLng = typeof longitude === 'number' ? longitude : lng;

    const profile = await this.driverProfileModel.findOneAndUpdate(
      { accountId: new Types.ObjectId(accountId) },
      {
        $set: {
          latitude: finalLat,
          longitude: finalLng,
          isOnline: isOnline ?? true,
          lastLocationUpdate: new Date(),
        },
      },
      { new: true, upsert: true },
    ).lean().exec();

    return {
      success: true,
      message: 'Location updated successfully',
      latitude: profile.latitude,
      longitude: profile.longitude,
      isOnline: profile.isOnline,
    };
  }

  @Get('profile')
  @Roles('DRIVER', 'ADMIN')
  @ApiOperation({ summary: 'Get profile fallback endpoint' })
  async getProfile(@Request() req: any) {
    const accountId = this.getActorId(req);
    const profile = await this.driverProfileModel.findOne({
      accountId: new Types.ObjectId(accountId),
    }).lean().exec();

    if (!profile) {
      return {
        accountId,
        isOnline: false,
        isVerified: true,
        verificationStatus: 'APPROVED',
        rating: 5,
        totalTrips: 0,
      };
    }
    return profile;
  }
}
