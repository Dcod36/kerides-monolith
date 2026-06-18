import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiQuery,
} from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CreateStandDto } from '../dto/admin/create-stand.dto';
import { StandRepository } from '../repositories/stand.repository';

@ApiTags('Admin Stands')
@ApiBearerAuth()
@Controller('admin/stands')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StandAdminController {
  constructor(
    private readonly standRepository: StandRepository,
    @InjectModel('DriverProfile') private readonly driverProfileModel: Model<any>,
    @InjectModel('Account') private readonly accountModel: Model<any>,
  ) {}

  // ─── List Stands ───────────────────────────────────────────────────────────
  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List all stands (admin)' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Stands fetched successfully' })
  async listStands(
    @Query('isActive') isActive?: string,
    @Query('search') search?: string,
  ) {
    const isActiveBool =
      typeof isActive === 'string' ? isActive.toLowerCase() === 'true' : undefined;

    return this.standRepository.findAll({ isActive: isActiveBool, search });
  }

  // ─── List Pending Stand Requests (MUST be before :id route) ───────────────
  @Get('requests')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List all pending driver stand join requests (admin)' })
  @ApiResponse({ status: 200, description: 'Pending requests fetched successfully' })
  async listPendingRequests() {
    const profiles = await this.driverProfileModel
      .find({ standRequestStatus: 'PENDING' })
      .lean()
      .exec() as any[];

    if (!profiles.length) return [];

    const accountIds = profiles
      .map((p) => String(p.accountId || ''))
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const accounts = await this.accountModel.db
      .collection('accounts')
      .find(
        { _id: { $in: accountIds } },
        { projection: { fullName: 1, phoneNumber: 1, email: 1 } },
      )
      .toArray();

    const accountsById = new Map<string, any>();
    for (const acc of accounts) {
      accountsById.set(String(acc._id), acc);
    }

    const standIds = profiles
      .map((p) => String(p.pendingStandRequestId || ''))
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const stands = standIds.length
      ? await this.driverProfileModel.db
          .collection('stands')
          .find({ _id: { $in: standIds } }, { projection: { name: 1 } })
          .toArray()
      : [];

    const standsById = new Map<string, any>();
    for (const s of stands) {
      standsById.set(String(s._id), s);
    }

    return profiles.map((p) => {
      const acc = accountsById.get(String(p.accountId)) || {};
      const stand = standsById.get(String(p.pendingStandRequestId)) || {};
      return {
        driverProfileId: p._id,
        accountId: p.accountId,
        fullName: acc.fullName,
        phoneNumber: acc.phoneNumber,
        email: acc.email,
        pendingStandRequestId: p.pendingStandRequestId,
        pendingStandName: stand.name ?? null,
        standRequestStatus: p.standRequestStatus,
        requestedAt: p.updatedAt,
      };
    });
  }

  // ─── Get Single Stand ──────────────────────────────────────────────────────
  @Get(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get stand by ID (admin)' })
  @ApiResponse({ status: 200, description: 'Stand fetched successfully' })
  @ApiResponse({ status: 404, description: 'Stand not found' })
  async getStand(@Param('id') id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid stand ID');
    }

    const stand = await this.standRepository.findById(id);
    if (!stand) throw new NotFoundException('Stand not found');

    return stand;
  }

  // ─── Create Stand ──────────────────────────────────────────────────────────
  @Post()
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new stand (admin)' })
  @ApiResponse({ status: 201, description: 'Stand created successfully' })
  async createStand(@Body() dto: CreateStandDto) {
    return this.standRepository.create({
      name: dto.name,
      latitude: dto.latitude,
      longitude: dto.longitude,
      radiusKm: dto.radiusKm,
      isActive: dto.isActive,
      address: dto.address,
      landmark: dto.landmark,
    });
  }

  // ─── Update Stand (full update) ────────────────────────────────────────────
  @Put(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update stand details (admin)' })
  @ApiResponse({ status: 200, description: 'Stand updated successfully' })
  @ApiResponse({ status: 404, description: 'Stand not found' })
  async updateStand(
    @Param('id') id: string,
    @Body() dto: Partial<CreateStandDto>,
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid stand ID');
    }

    const stand = await this.standRepository.updateById(id, dto);
    if (!stand) throw new NotFoundException('Stand not found');

    return stand;
  }

  // ─── Toggle Active Status ──────────────────────────────────────────────────
  @Patch(':id/status')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Toggle stand active status (admin)' })
  @ApiResponse({ status: 200, description: 'Stand status updated' })
  @ApiResponse({ status: 404, description: 'Stand not found' })
  async updateStandStatus(
    @Param('id') id: string,
    @Body('isActive') isActive: boolean,
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid stand ID');
    }

    const stand = await this.standRepository.updateStatus(id, isActive);
    if (!stand) throw new NotFoundException('Stand not found');

    return stand;
  }

  // ─── Delete Stand ──────────────────────────────────────────────────────────
  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a stand (admin)' })
  @ApiResponse({ status: 200, description: 'Stand deleted successfully' })
  @ApiResponse({ status: 404, description: 'Stand not found' })
  async deleteStand(@Param('id') id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid stand ID');
    }

    const stand = await this.standRepository.deleteById(id);
    if (!stand) throw new NotFoundException('Stand not found');

    // Clean up all driver profiles that were assigned to this stand
    const standObjectId = new Types.ObjectId(id);
    const cleanupResult = await this.driverProfileModel.updateMany(
      {
        $or: [
          { assignedStandId: standObjectId },
          { pendingStandRequestId: standObjectId },
        ],
      },
      {
        $set: {
          assignedStandId: null,
          pendingStandRequestId: null,
          standRequestStatus: null,
        },
      },
    ).exec();

    return {
      message: 'Stand deleted successfully',
      id,
      driversUnassigned: cleanupResult.modifiedCount,
    };
  }



  // ─── Approve Stand Request ─────────────────────────────────────────────────
  @Patch('requests/:driverProfileId/approve')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a driver stand join request (admin)' })
  @ApiResponse({ status: 200, description: 'Stand request approved' })
  @ApiResponse({ status: 404, description: 'Driver profile not found or no pending request' })
  async approveStandRequest(@Param('driverProfileId') driverProfileId: string) {
    if (!Types.ObjectId.isValid(driverProfileId)) {
      throw new BadRequestException('Invalid driverProfileId');
    }

    const profile = await this.driverProfileModel
      .findOne({ _id: new Types.ObjectId(driverProfileId), standRequestStatus: 'PENDING' })
      .lean()
      .exec() as any;

    if (!profile) {
      throw new NotFoundException('No pending stand request found for this driver');
    }

    const updated = await this.driverProfileModel
      .findByIdAndUpdate(
        new Types.ObjectId(driverProfileId),
        {
          $set: {
            assignedStandId: profile.pendingStandRequestId,
            standRequestStatus: 'APPROVED',
            pendingStandRequestId: null,
          },
        },
        { new: true },
      )
      .lean()
      .exec() as any;

    return {
      message: 'Stand request approved. Driver has been assigned to the stand.',
      assignedStandId: updated.assignedStandId,
      standRequestStatus: updated.standRequestStatus,
    };
  }

  // ─── Reject Stand Request ──────────────────────────────────────────────────
  @Patch('requests/:driverProfileId/reject')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a driver stand join request (admin)' })
  @ApiResponse({ status: 200, description: 'Stand request rejected' })
  @ApiResponse({ status: 404, description: 'Driver profile not found or no pending request' })
  async rejectStandRequest(@Param('driverProfileId') driverProfileId: string) {
    if (!Types.ObjectId.isValid(driverProfileId)) {
      throw new BadRequestException('Invalid driverProfileId');
    }

    const profile = await this.driverProfileModel
      .findOne({ _id: new Types.ObjectId(driverProfileId), standRequestStatus: 'PENDING' })
      .lean()
      .exec();

    if (!profile) {
      throw new NotFoundException('No pending stand request found for this driver');
    }

    const updated = await this.driverProfileModel
      .findByIdAndUpdate(
        new Types.ObjectId(driverProfileId),
        {
          $set: {
            standRequestStatus: 'REJECTED',
            pendingStandRequestId: null,
          },
        },
        { new: true },
      )
      .lean()
      .exec() as any;

    return {
      message: 'Stand request rejected.',
      standRequestStatus: updated.standRequestStatus,
    };
  }

  // ─── Unassign Driver from Stand ────────────────────────────────────────────
  @Delete('drivers/:driverProfileId/unassign')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a driver from their assigned stand (admin)' })
  @ApiResponse({ status: 200, description: 'Driver unassigned from stand' })
  @ApiResponse({ status: 404, description: 'Driver profile not found' })
  async unassignDriver(@Param('driverProfileId') driverProfileId: string) {
    if (!Types.ObjectId.isValid(driverProfileId)) {
      throw new BadRequestException('Invalid driverProfileId');
    }

    const profile = await this.driverProfileModel
      .findById(new Types.ObjectId(driverProfileId))
      .lean()
      .exec();

    if (!profile) {
      throw new NotFoundException('Driver profile not found');
    }

    await this.driverProfileModel
      .findByIdAndUpdate(
        new Types.ObjectId(driverProfileId),
        {
          $set: {
            assignedStandId: null,
            standRequestStatus: null,
            pendingStandRequestId: null,
          },
        },
      )
      .exec();

    return { message: 'Driver has been unassigned from their stand.' };
  }

  // ─── List Drivers Assigned to a Stand ─────────────────────────────────────
  @Get(':standId/drivers')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List all drivers assigned to a specific stand (admin)' })
  @ApiResponse({ status: 200, description: 'Drivers fetched successfully' })
  @ApiResponse({ status: 404, description: 'Stand not found' })
  async getDriversByStand(@Param('standId') standId: string) {
    if (!Types.ObjectId.isValid(standId)) {
      throw new BadRequestException('Invalid standId');
    }

    const stand = await this.standRepository.findById(standId);
    if (!stand) throw new NotFoundException('Stand not found');

    const profiles = await this.driverProfileModel
      .find({ assignedStandId: new Types.ObjectId(standId) })
      .lean()
      .exec() as any[];

    if (!profiles.length) return [];

    const accountIds = profiles
      .map((p) => String(p.accountId || ''))
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const accounts = await this.accountModel.db
      .collection('accounts')
      .find(
        { _id: { $in: accountIds } },
        { projection: { fullName: 1, phoneNumber: 1, email: 1 } },
      )
      .toArray();

    const accountsById = new Map<string, any>();
    for (const acc of accounts) {
      accountsById.set(String(acc._id), acc);
    }

    return profiles.map((p) => {
      const acc = accountsById.get(String(p.accountId)) || {};
      return {
        driverProfileId: p._id,
        accountId: p.accountId,
        fullName: acc.fullName,
        phoneNumber: acc.phoneNumber,
        email: acc.email,
        isOnline: p.isOnline,
        isVerified: p.isVerified,
        rating: p.rating,
        totalTrips: p.totalTrips,
      };
    });
  }
}
