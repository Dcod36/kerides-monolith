import {
  Controller,
  Get,
  Header,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AssignStandDto } from '../dto/admin/assign-stand.dto';
import { DriverVerificationDto } from '../dto/admin/driver-verification.dto';

@ApiTags('Admin Drivers')
@ApiBearerAuth()
@Controller('admin/drivers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DriverAdminController {
  constructor(
    @InjectModel('DriverProfile') private readonly driverProfileModel: Model<any>,
    @InjectModel('Account') private readonly accountModel: Model<any>,
  ) {}

  @Get('export')
  @Roles('ADMIN')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="drivers.csv"')
  @ApiOperation({ summary: 'Export drivers CSV (admin)' })
  async exportDrivers(
    @Query('isVerified') isVerified?: string,
    @Query('verificationStatus') verificationStatus?: string,
    @Query('isOnline') isOnline?: string,
    @Query('assignedStandId') assignedStandId?: string,
    @Query('search') search?: string,
  ) {
    const drivers = await this.listDrivers(
      isVerified,
      verificationStatus,
      isOnline,
      assignedStandId,
      search,
    );

    const header = [
      'profileId',
      'accountId',
      'fullName',
      'email',
      'phoneNumber',
      'isVerified',
      'verificationStatus',
      'isOnline',
      'assignedStandId',
      'rating',
      'totalTrips',
      'createdAt',
      'updatedAt',
    ];

    const escapeCsv = (value: unknown) => {
      if (value === null || value === undefined) return '';
      const raw = String(value);
      if (raw.includes('"') || raw.includes(',') || raw.includes('\n') || raw.includes('\r')) {
        return `"${raw.replace(/"/g, '""')}"`;
      }
      return raw;
    };

    const rows = drivers.map((driver) => [
      driver._id,
      driver.accountId,
      driver.fullName,
      driver.email,
      driver.phoneNumber,
      driver.isVerified,
      driver.verificationStatus,
      driver.isOnline,
      driver.assignedStandId,
      driver.rating,
      driver.totalTrips,
      driver.createdAt ? new Date(driver.createdAt).toISOString() : '',
      driver.updatedAt ? new Date(driver.updatedAt).toISOString() : '',
    ]);

    return [header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
  }

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List drivers for admin' })
  @ApiResponse({ status: 200, description: 'Drivers fetched successfully' })
  async listDrivers(
    @Query('isVerified') isVerified?: string,
    @Query('verificationStatus') verificationStatus?: string,
    @Query('isOnline') isOnline?: string,
    @Query('assignedStandId') assignedStandId?: string,
    @Query('search') search?: string,
  ): Promise<any[]> {
    const query: Record<string, any> = {};

    if (typeof isVerified === 'string') {
      query.isVerified = isVerified.toLowerCase() === 'true';
    }

    if (verificationStatus) {
      query.verificationStatus = verificationStatus.toUpperCase();
    }

    if (typeof isOnline === 'string') {
      query.isOnline = isOnline.toLowerCase() === 'true';
    }

    if (assignedStandId) {
      query.assignedStandId = Types.ObjectId.isValid(assignedStandId)
        ? new Types.ObjectId(assignedStandId)
        : assignedStandId;
    }

    const profiles = await this.driverProfileModel.find(query).lean().exec() as any[];

    if (!profiles.length) {
      return [];
    }

    const accountIds = profiles
      .map((profile) => String(profile.accountId || ''))
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const accounts = await this.accountModel.db.collection('accounts')
      .find({ _id: { $in: accountIds } }, { projection: { fullName: 1, phoneNumber: 1, email: 1 } })
      .toArray();

    const accountsById = new Map<string, any>();
    for (const account of accounts) {
      accountsById.set(String(account._id), account);
    }

    const searchText = String(search || '').trim().toLowerCase();

    const enriched = profiles.map((profile) => {
      const account = accountsById.get(String(profile.accountId)) || {};
      return {
        ...profile,
        fullName: account.fullName,
        phoneNumber: account.phoneNumber,
        email: account.email,
      };
    });

    if (!searchText) {
      return enriched;
    }

    return enriched.filter((profile) => {
      const haystack = [
        profile.fullName,
        profile.phoneNumber,
        profile.email,
      ]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');
      return haystack.includes(searchText);
    });
  }

  @Patch('bulk-approve')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk approve existing drivers (admin)' })
  @ApiResponse({ status: 200, description: 'Drivers bulk approved' })
  async bulkApproveDrivers() {
    const now = new Date();
    const result = await this.driverProfileModel.updateMany(
      {
        $or: [
          { isVerified: { $ne: true } },
          { verificationStatus: { $ne: 'APPROVED' } },
        ],
      },
      {
        $set: {
          isVerified: true,
          verificationStatus: 'APPROVED',
          verifiedAt: now,
        },
      },
    );

    return {
      matched: result.matchedCount,
      modified: result.modifiedCount,
    };
  }

  @Get(':accountId')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get driver profile by account id' })
  @ApiResponse({ status: 200, description: 'Driver profile fetched successfully' })
  async getDriver(@Param('accountId') accountId: string) {
    const profile = await this.driverProfileModel
      .findOne({ accountId: new Types.ObjectId(accountId) })
      .lean()
      .exec();

    if (!profile) {
      return null;
    }

    const account = await this.accountModel
      .findById(new Types.ObjectId(accountId), { fullName: 1, phoneNumber: 1, email: 1 })
      .lean()
      .exec() as any;

    return {
      ...profile,
      fullName: account?.fullName,
      phoneNumber: account?.phoneNumber,
      email: account?.email,
    };
  }

  @Patch(':accountId/stand')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Assign or clear stand for driver' })
  @ApiResponse({ status: 200, description: 'Driver stand assignment updated' })
  async assignStand(
    @Param('accountId') accountId: string,
    @Body() body: AssignStandDto,
  ) {
    const normalizedStandId = body.assignedStandId
      ? (Types.ObjectId.isValid(body.assignedStandId)
          ? new Types.ObjectId(body.assignedStandId)
          : body.assignedStandId)
      : null;

    const update: Record<string, any> = {
      assignedStandId: normalizedStandId,
    };

    return this.driverProfileModel
      .findOneAndUpdate({ accountId: new Types.ObjectId(accountId) }, { $set: update }, { new: true })
      .lean()
      .exec();
  }

  @Patch(':accountId/verification')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update driver verification status' })
  @ApiResponse({ status: 200, description: 'Driver verification updated' })
  async updateVerification(
    @Param('accountId') accountId: string,
    @Body() body: DriverVerificationDto,
  ) {
    const update: Record<string, any> = {};

    if (typeof body.isVerified === 'boolean') {
      update.isVerified = body.isVerified;
    }

    if (body.verificationStatus) {
      update.verificationStatus = body.verificationStatus;
    }

    if (body.verificationNotes !== undefined) {
      update.verificationNotes = body.verificationNotes;
    }

    if (Object.keys(update).length > 0) {
      update.verifiedAt = new Date();
    }

    return this.driverProfileModel
      .findOneAndUpdate({ accountId: new Types.ObjectId(accountId) }, { $set: update }, { new: true })
      .lean()
      .exec();
  }
}
