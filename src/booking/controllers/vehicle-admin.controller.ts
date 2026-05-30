import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { VehicleService } from '../services/vehicle.service';
import { VehicleVerificationDto } from '../dto/admin/vehicle-verification.dto';

@ApiTags('Admin Vehicles')
@ApiBearerAuth()
@Controller('admin/vehicles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VehicleAdminController {
  constructor(private readonly vehicleService: VehicleService) {}

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List vehicles for admin' })
  @ApiResponse({ status: 200, description: 'Vehicles fetched successfully' })
  async listVehicles(
    @Query('verificationStatus') verificationStatus?: string,
    @Query('isActive') isActive?: string,
    @Query('driverId') driverId?: string,
  ) {
    return this.vehicleService.listVehiclesForAdmin({
      verificationStatus,
      isActive,
      driverId,
    });
  }

  @Get(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get vehicle by id (admin)' })
  @ApiResponse({ status: 200, description: 'Vehicle fetched successfully' })
  async getVehicle(@Param('id') id: string) {
    return this.vehicleService.getVehicleForAdmin(id);
  }

  @Patch('bulk-approve')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Bulk approve existing vehicles (admin)' })
  @ApiResponse({ status: 200, description: 'Vehicles bulk approved' })
  async bulkApproveVehicles() {
    return this.vehicleService.bulkApproveForAdmin();
  }

  @Patch(':id/verification')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update vehicle verification status' })
  @ApiResponse({ status: 200, description: 'Vehicle verification updated' })
  async updateVerification(
    @Param('id') id: string,
    @Body() body: VehicleVerificationDto,
  ) {
    return this.vehicleService.updateVerificationForAdmin(id, body);
  }
}
