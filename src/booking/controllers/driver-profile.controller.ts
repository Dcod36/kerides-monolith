import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  NotFoundException,
  ConflictException,
  BadRequestException,
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
    @InjectModel('Stand') private readonly standModel: Model<any>,
    @InjectModel('Account') private readonly accountModel: Model<any>,
  ) { }

  private getActorId(req: any): string {
    return req?.user?.userId || req?.user?.accountId || req?.user?.id || req?.user?.sub;
  }


  private async buildFullProfile(accountId: string): Promise<any> {
    const [profile, account] = await Promise.all([
      this.driverProfileModel.findOne({ accountId: new Types.ObjectId(accountId) }).lean().exec(),
      this.accountModel.findById(new Types.ObjectId(accountId), {
        passwordHash: 0, emailOtp: 0, emailOtpExpires: 0,
      }).lean().exec(),
    ]);

    // Base account-level personal info
    const accountInfo = account
      ? {
        fullName: (account as any).fullName ?? null,
        email: (account as any).email ?? null,
        phoneNumber: (account as any).phoneNumber ?? null,
        address: (account as any).address ?? null,
        addressDetails: (account as any).addressDetails ?? null,
        profileImage: (account as any).profileImage ?? null,
        role: (account as any).role ?? 'DRIVER',
        isActive: (account as any).isActive ?? true,
        emailVerified: (account as any).emailVerified ?? false,
      }
      : {};

    if (!profile) {
      return {
        accountId,
        ...accountInfo,
        isOnline: false,
        isVerified: true,
        verificationStatus: 'APPROVED',
        rating: 5,
        totalTrips: 0,
        operatingArea: [],
        emergencyContact: null,
      };
    }


    return {
      ...accountInfo,
      ...profile,
      // Always expose these from account (they are the source of truth)
      fullName: (account as any)?.fullName ?? (profile as any).fullName ?? null,
      email: (account as any)?.email ?? null,
      phoneNumber: (account as any)?.phoneNumber ?? (profile as any).phoneNumber ?? null,
      address: (account as any)?.address ?? (profile as any).address ?? null,
      addressDetails: (account as any)?.addressDetails ?? (profile as any).addressDetails ?? null,
    };
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
  @ApiOperation({ summary: 'Get current driver profile (merged: account + driver-profile)' })
  @ApiResponse({ status: 200, description: 'Returns merged account + driver profile data including address, emergencyContact, operatingArea' })
  async getMyProfile(@Request() req: any) {
    const accountId = this.getActorId(req);
    return this.buildFullProfile(accountId);
  }

  @Put('me')
  @Roles('DRIVER', 'ADMIN')
  @ApiOperation({ summary: 'Update driver profile — routes account fields (address/name/phone) to accounts collection' })
  async updateMyProfile(@Request() req: any, @Body() updateDto: any) {
    const accountId = this.getActorId(req);

    // ── Fields that belong on the Account document ──────────────────────────
    const ACCOUNT_FIELDS = ['fullName', 'phoneNumber', 'address', 'addressDetails', 'profileImage'];
    const accountUpdates: Record<string, any> = {};
    const profileUpdates: Record<string, any> = {};

    for (const [key, value] of Object.entries(updateDto)) {
      if (ACCOUNT_FIELDS.includes(key)) {
        accountUpdates[key] = value;
      } else {
        profileUpdates[key] = value;
      }
    }

    // Run both updates in parallel when there is something to update
    await Promise.all([
      Object.keys(accountUpdates).length > 0
        ? this.accountModel.findByIdAndUpdate(
          new Types.ObjectId(accountId),
          { $set: accountUpdates },
        ).exec()
        : Promise.resolve(),
      Object.keys(profileUpdates).length > 0
        ? this.driverProfileModel.findOneAndUpdate(
          { accountId: new Types.ObjectId(accountId) },
          { $set: profileUpdates },
          { new: true, upsert: true },
        ).exec()
        : Promise.resolve(),
    ]);

    // Return the merged, up-to-date combined profile
    return this.buildFullProfile(accountId);
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

  // ─── Nearby Stands ────────────────────────────────────────────────────────
  @Get('me/nearby-stands')
  @Roles('DRIVER', 'ADMIN')
  @ApiOperation({
    summary: 'List active stands near the driver\'s current location',
    description:
      'Returns active stands within the given radius sorted by distance. ' +
      'Driver can use this to browse and pick a stand to join.',
  })
  async getNearbyStands(
    @Query('latitude') latStr: string,
    @Query('longitude') lngStr: string,
    @Query('radiusKm') radiusKmStr?: string,
  ) {
    const latitude = parseFloat(latStr);
    const longitude = parseFloat(lngStr);
    const radiusKm = parseFloat(radiusKmStr || '5');

    if (isNaN(latitude) || isNaN(longitude)) {
      throw new BadRequestException('latitude and longitude query params are required');
    }

    const stands = await this.standModel
      .find({
        isActive: true,
        location: {
          $nearSphere: {
            $geometry: { type: 'Point', coordinates: [longitude, latitude] },
            $maxDistance: radiusKm * 1000, // metres
          },
        },
      })
      .lean()
      .exec() as any[];

    // Flatten GeoJSON → lat/lng for frontend
    return stands.map((stand) => ({
      ...stand,
      latitude: stand.location?.coordinates?.[1] ?? null,
      longitude: stand.location?.coordinates?.[0] ?? null,
    }));
  }

  // ─── Request to Join a Stand ──────────────────────────────────────────────
  @Post('me/stand-request')
  @Roles('DRIVER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request to join a stand (requires admin approval)',
    description:
      'Driver submits a join request for a specific stand. ' +
      'Sets pendingStandRequestId and standRequestStatus=PENDING. ' +
      'Does NOT change assignedStandId — booking availability is unaffected.',
  })
  async requestStand(
    @Request() req: any,
    @Body('standId') standId: string,
  ) {
    if (!standId) {
      throw new BadRequestException('standId is required in the request body');
    }

    if (!Types.ObjectId.isValid(standId)) {
      throw new BadRequestException('Invalid standId');
    }

    const accountId = this.getActorId(req);

    // Make sure the stand exists and is active
    const stand = await this.standModel.findOne({
      _id: new Types.ObjectId(standId),
      isActive: true,
    }).lean().exec() as any;

    if (!stand) {
      throw new NotFoundException('Stand not found or is not active');
    }

    // Block if driver already has a pending request
    const existing = await this.driverProfileModel.findOne({
      accountId: new Types.ObjectId(accountId),
      standRequestStatus: 'PENDING',
    }).lean().exec();

    if (existing) {
      throw new ConflictException(
        'You already have a pending stand request. Cancel it before requesting a new one.',
      );
    }

    const profile = await this.driverProfileModel.findOneAndUpdate(
      { accountId: new Types.ObjectId(accountId) },
      {
        $set: {
          pendingStandRequestId: new Types.ObjectId(standId),
          standRequestStatus: 'PENDING',
        },
      },
      { new: true, upsert: true },
    ).lean().exec() as any;

    return {
      message: 'Stand request submitted successfully. Awaiting admin approval.',
      standId,
      standName: stand.name,
      standRequestStatus: profile.standRequestStatus,
    };
  }

  // ─── Cancel Pending Stand Request ─────────────────────────────────────────
  @Delete('me/stand-request')
  @Roles('DRIVER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel the driver\'s pending stand join request',
    description: 'Clears pendingStandRequestId and standRequestStatus. Does not affect assignedStandId.',
  })
  async cancelStandRequest(@Request() req: any) {
    const accountId = this.getActorId(req);

    const profile = await this.driverProfileModel.findOne({
      accountId: new Types.ObjectId(accountId),
    }).lean().exec() as any;

    if (!profile) {
      throw new NotFoundException('Driver profile not found');
    }

    if (profile.standRequestStatus !== 'PENDING') {
      throw new BadRequestException('No pending stand request to cancel');
    }

    await this.driverProfileModel.findOneAndUpdate(
      { accountId: new Types.ObjectId(accountId) },
      { $set: { pendingStandRequestId: null, standRequestStatus: null } },
    ).exec();

    return { message: 'Stand request cancelled successfully.' };
  }
}
