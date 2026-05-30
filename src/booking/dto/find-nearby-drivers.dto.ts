import { IsNumber, IsOptional, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class FindNearbyDriversDto {
  @ApiPropertyOptional({ example: 28.6139, description: 'Pickup latitude' })
  @Type(() => Number)
  @IsNumber()
  pickupLat: number;

  @ApiPropertyOptional({ example: 77.2090, description: 'Pickup longitude' })
  @Type(() => Number)
  @IsNumber()
  pickupLng: number;

  @ApiPropertyOptional({ example: 5, description: 'Search radius in kilometers', default: 5, minimum: 1, maximum: 50 })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  radiusKm?: number;

  @ApiPropertyOptional({ example: 10, description: 'Maximum number of drivers to return', default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ example: 'SEDAN', description: 'Filter by vehicle type' })
  @IsOptional()
  vehicleType?: string;
}
