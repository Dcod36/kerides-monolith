import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

/**
 * User Profile Controller (Auth module — Monolith)
 *
 * Profile data (address, image, preferences) is stored directly on the
 * Account document. No separate collection needed in a monolith.
 *
 * Routes:
 *   GET  /profiles/me                       → fetch full profile
 *   PUT  /profiles/me                       → update profile fields
 *   POST /profiles                          → upsert (create or update)
 *   POST /profiles/me/image/presign-upload  → stub upload URL
 *   POST /profiles/me/image/presign-view    → stub view URL
 */
@ApiTags('User Profiles')
@Controller('profiles')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ProfileController {
  constructor(
    @InjectModel('Account') private readonly accountModel: Model<any>,
  ) {}

  private getAccountId(req: any): string {
    return (
      req?.user?.userId ||
      req?.user?.accountId ||
      req?.user?.id ||
      req?.user?.sub
    );
  }

  // ─── GET /profiles/me ────────────────────────────────────────────────────────

  @Get('me')
  @Roles('USER', 'ADMIN')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile returned' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async getMyProfile(@Request() req: any) {
    const accountId = this.getAccountId(req);

    const account = await this.accountModel
      .findById(new Types.ObjectId(accountId), {
        passwordHash: 0,
        emailOtp: 0,
        emailOtpExpires: 0,
      })
      .lean()
      .exec();

    if (!account) throw new NotFoundException('Account not found');
    return this.formatProfile(account);
  }

  // ─── PUT /profiles/me ────────────────────────────────────────────────────────

  @Put('me')
  @Roles('USER', 'ADMIN')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  async updateMyProfile(@Request() req: any, @Body() updateDto: any) {
    const accountId = this.getAccountId(req);
    const fields = this.extractAllowedFields(updateDto);

    const updated = await this.accountModel
      .findByIdAndUpdate(
        new Types.ObjectId(accountId),
        { $set: fields },
        {
          new: true,
          projection: { passwordHash: 0, emailOtp: 0, emailOtpExpires: 0 },
        },
      )
      .lean()
      .exec();

    if (!updated) throw new NotFoundException('Account not found');
    return this.formatProfile(updated);
  }

  // ─── POST /profiles ───────────────────────────────────────────────────────────

  @Post()
  @Roles('USER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create or update user profile (upsert)' })
  async upsertProfile(@Request() req: any, @Body() createDto: any) {
    const accountId = this.getAccountId(req);
    const fields = this.extractAllowedFields(createDto);

    const updated = await this.accountModel
      .findByIdAndUpdate(
        new Types.ObjectId(accountId),
        { $set: fields },
        {
          new: true,
          upsert: false,
          projection: { passwordHash: 0, emailOtp: 0, emailOtpExpires: 0 },
        },
      )
      .lean()
      .exec();

    if (!updated) throw new NotFoundException('Account not found');
    return this.formatProfile(updated);
  }

  // ─── POST /profiles/me/image/presign-upload ───────────────────────────────────

  @Post('me/image/presign-upload')
  @Roles('USER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get presigned URL for profile image upload (stub)' })
  async presignUpload(@Request() req: any, @Body() body: any) {
    const accountId = this.getAccountId(req);
    const fileName = body?.fileName || 'profile.jpg';
    const fileUrl = `user-profile-images/${accountId}/${fileName}`;
    return {
      uploadUrl: `http://localhost:3000/dummy-upload`,
      fileUrl,
      viewUrl: fileUrl,
    };
  }

  // ─── POST /profiles/me/image/presign-view ────────────────────────────────────

  @Post('me/image/presign-view')
  @Roles('USER', 'ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get presigned URL to view profile image (stub)' })
  async presignView(@Body() body: any) {
    return { viewUrl: body?.fileUrl || null };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /** Only allow profile fields — never auth fields (email, role, passwordHash) */
  private extractAllowedFields(dto: any): Record<string, any> {
    const fields: Record<string, any> = {};

    if (dto?.address !== undefined) fields.address = dto.address;
    if (dto?.addressDetails !== undefined) fields.addressDetails = dto.addressDetails;
    // Accept both 'profileImage' and 'image' keys from frontend
    if (dto?.profileImage !== undefined) fields.profileImage = dto.profileImage;
    else if (dto?.image !== undefined) fields.profileImage = dto.image;

    if (dto?.preferences !== undefined) {
      fields.preferences = Array.isArray(dto.preferences)
        ? dto.preferences
        : typeof dto.preferences === 'string'
          ? [dto.preferences]
          : [];
    }
    if (dto?.fullName !== undefined) fields.fullName = String(dto.fullName).trim();
    if (dto?.phoneNumber !== undefined) fields.phoneNumber = String(dto.phoneNumber).trim();

    return fields;
  }

  private formatProfile(account: any) {
    return {
      id: String(account._id),
      fullName: account.fullName || null,
      email: account.email,
      phoneNumber: account.phoneNumber || null,
      role: account.role,
      isActive: account.isActive,
      emailVerified: account.emailVerified,
      profileImage: account.profileImage || null,
      image: account.profileImage || null, // alias for frontend compatibility
      address: account.address || null,
      addressDetails: account.addressDetails || null,
      preferences: account.preferences || [],
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }
}
