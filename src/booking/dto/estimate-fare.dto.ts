import { IsNumber, IsOptional, IsMongoId, Min, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class EstimateFareDto {
  @ApiProperty({ example: 5200, description: 'Distance in meters' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  distanceInMeters: number;

  @ApiProperty({ example: 900, description: 'Estimated duration in seconds' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  durationInSeconds: number;

  @ApiPropertyOptional({ example: '507f1f77bcf86cd799439011', description: 'Vehicle ID to get vehicle-specific fare' })
  @IsOptional()
  @IsString()
  vehicleId?: string;

  @ApiPropertyOptional({ example: 'SEDAN', description: 'Vehicle type (alternative to vehicleId)' })
  @IsOptional()
  @IsString()
  vehicleType?: string;
}

export class EstimateFareResponseDto {
  @ApiProperty({ example: 120.50, description: 'Estimated fare amount' })
  estimatedFare: number;

  @ApiProperty({
    example: {
      baseFare: 50,
      distanceFare: 65,
      timeFare: 5.50,
      surgeFare: 0,
      total: 120.50,
    },
    description: 'Detailed fare breakdown',
  })
  fareBreakdown: {
    baseFare: number;
    distanceFare: number;
    timeFare: number;
    surgeFare: number;
    total: number;
  };

  @ApiProperty({ example: 'SEDAN', description: 'Vehicle type used for calculation' })
  vehicleType: string;
}
