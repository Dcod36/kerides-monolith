import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { VehicleService } from '../services/vehicle.service';
import { CreateVehicleDto } from '../dto/create-vehicle.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Vehicles')
@ApiBearerAuth()
@Controller('vehicles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VehicleController {
  constructor(private readonly vehicleService: VehicleService) {}

  private getActorId(req: any): string {
    return req?.user?.userId || req?.user?.accountId || req?.user?.id || req?.user?.sub;
  }

  @Post()
  @Roles('DRIVER', 'ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new vehicle' })
  @ApiResponse({ status: 201, description: 'Vehicle created successfully' })
  async create(@Request() req: any, @Body() createDto: CreateVehicleDto) {
    const driverId = this.getActorId(req);
    return this.vehicleService.create(driverId, createDto);
  }

  @Get('my-vehicles')
  @Roles('DRIVER', 'ADMIN')
  @ApiOperation({ summary: 'Get current driver\'s vehicles' })
  @ApiResponse({ status: 200, description: 'Vehicles list returned successfully' })
  async getMyVehicles(@Request() req: any) {
    const driverId = this.getActorId(req);
    return this.vehicleService.findMyVehicles(driverId);
  }

  @Get(':id')
  @Roles('DRIVER', 'ADMIN')
  @ApiOperation({ summary: 'Get vehicle by ID' })
  @ApiResponse({ status: 200, description: 'Vehicle returned successfully' })
  async getVehicle(@Param('id') id: string) {
    return this.vehicleService.findById(id);
  }

  @Put(':id')
  @Roles('DRIVER', 'ADMIN')
  @ApiOperation({ summary: 'Update vehicle details' })
  @ApiResponse({ status: 200, description: 'Vehicle updated successfully' })
  async updateVehicle(
    @Param('id') id: string,
    @Request() req: any,
    @Body() updateDto: Partial<CreateVehicleDto>
  ) {
    const driverId = this.getActorId(req);
    return this.vehicleService.update(id, driverId, updateDto);
  }

  @Patch(':id/deactivate')
  @Roles('DRIVER', 'ADMIN')
  @ApiOperation({ summary: 'Deactivate a vehicle' })
  @ApiResponse({ status: 200, description: 'Vehicle deactivated successfully' })
  async deactivateVehicle(@Param('id') id: string, @Request() req: any) {
    const driverId = this.getActorId(req);
    return this.vehicleService.deactivate(id, driverId);
  }
}
