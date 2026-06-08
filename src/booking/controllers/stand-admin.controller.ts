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
import { Types } from 'mongoose';
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
  constructor(private readonly standRepository: StandRepository) {}

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

    return { message: 'Stand deleted successfully', id };
  }
}
