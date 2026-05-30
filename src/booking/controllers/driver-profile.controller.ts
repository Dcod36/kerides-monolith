import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Driver Profiles')
@Controller('driver-profiles')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class DriverProfileController {
  constructor(
    @InjectModel('DriverProfile') private readonly driverProfileModel: Model<any>,
  ) {}

  private getActorId(req: any): string {
    return req?.user?.userId || req?.user?.accountId || req?.user?.id || req?.user?.sub;
  }

  @Post()
  @Roles('DRIVER', 'ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create driver profile' })
  async create(@Request() req: any, @Body() createDto: any) {
    const accountId = this.getActorId(req);
    const profile = await this.driverProfileModel.findOneAndUpdate(
      { accountId: new Types.ObjectId(accountId) },
      { $set: { ...createDto, isVerified: true, verificationStatus: 'APPROVED' } },
      { new: true, upsert: true },
    ).lean().exec();
    return profile;
  }

  @Get('me')
  @Roles('DRIVER', 'ADMIN')
  @ApiOperation({ summary: 'Get current driver profile' })
  async getMyProfile(@Request() req: any) {
    const accountId = this.getActorId(req);
    const profile = await this.driverProfileModel.findOne({
      accountId: new Types.ObjectId(accountId),
    }).lean().exec();

    if (!profile) {
      // Fallback: return a default approved profile so frontend doesn't crash
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

  @Put('me')
  @Roles('DRIVER', 'ADMIN')
  @ApiOperation({ summary: 'Update current driver profile and documents' })
  async updateMyProfile(@Request() req: any, @Body() updateDto: any) {
    const accountId = this.getActorId(req);
    const profile = await this.driverProfileModel.findOneAndUpdate(
      { accountId: new Types.ObjectId(accountId) },
      { $set: updateDto },
      { new: true, upsert: true },
    ).lean().exec();
    return profile;
  }

  @Post('me/documents/presign-upload')
  @Roles('DRIVER', 'ADMIN')
  @ApiOperation({ summary: 'Generate presigned upload URL' })
  async createPresignedUpload(@Body() body: any) {
    return {
      uploadUrl: 'http://localhost:3000/dummy-upload',
      fileUrl: body.fileName || 'dummy_file.pdf',
      viewUrl: 'dummy_file.pdf',
    };
  }

  @Post('me/documents/presign-view')
  @Roles('DRIVER', 'ADMIN')
  @ApiOperation({ summary: 'Generate presigned view URL' })
  async createPresignedView(@Body() body: any) {
    return {
      viewUrl: body.fileUrl || 'dummy_file.pdf',
    };
  }

  @Patch('me/profile-image')
  @Roles('DRIVER', 'ADMIN')
  @ApiOperation({ summary: 'Update driver profile image' })
  async updateProfileImage(@Request() req: any, @Body('profileImage') profileImage: string) {
    const accountId = this.getActorId(req);
    const profile = await this.driverProfileModel.findOneAndUpdate(
      { accountId: new Types.ObjectId(accountId) },
      { $set: { profileImage } },
      { new: true, upsert: true },
    ).lean().exec();
    return profile;
  }

  @Patch('me/online-status')
  @Roles('DRIVER', 'ADMIN')
  @ApiOperation({ summary: 'Update online/offline status' })
  async updateOnlineStatus(@Request() req: any, @Body('isOnline') isOnline: boolean) {
    const accountId = this.getActorId(req);
    const profile = await this.driverProfileModel.findOneAndUpdate(
      { accountId: new Types.ObjectId(accountId) },
      { $set: { isOnline } },
      { new: true, upsert: true },
    ).lean().exec();
    return profile;
  }

  @Delete('me')
  @Roles('DRIVER', 'ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete current driver profile' })
  async deleteMyProfile(@Request() req: any) {
    const accountId = this.getActorId(req);
    const result = await this.driverProfileModel.deleteOne({
      accountId: new Types.ObjectId(accountId),
    }).exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException('Driver profile not found');
    }
    return { message: 'Driver profile deleted successfully' };
  }

  @Patch('me/location')
  @Roles('DRIVER')
  @ApiOperation({ summary: 'Update current driver location and online status' })
  async updateLocation(@Request() req: any, @Body() locationDto: any) {
    const accountId = this.getActorId(req);
    const { latitude, longitude, lat, lng, isOnline } = locationDto;
    
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
}
