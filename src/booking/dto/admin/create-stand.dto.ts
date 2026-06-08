import { IsString, IsNumber, IsOptional, IsBoolean, Min, Max, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateStandDto {
  @ApiProperty({ example: 'Rajapur Auto Stand', description: 'Name of the stand (recognizable pickup location)' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 9.9312, description: 'Latitude of the stand center point' })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({ example: 76.2673, description: 'Longitude of the stand center point' })
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @ApiPropertyOptional({ example: 2, description: 'Coverage radius in km for priority dispatch (default: 2)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(50)
  radiusKm?: number;

  @ApiPropertyOptional({ example: true, description: 'Whether the stand is active (default: true)' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    example: 'Rajapur Junction, Thrissur, Kerala 680005',
    description: 'Human-readable address for display in admin and driver app',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @ApiPropertyOptional({
    example: 'Opposite SBI Bank, Near Rajapur Bus Stop',
    description: 'Nearby landmark to help drivers identify the stand',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  landmark?: string;
}
