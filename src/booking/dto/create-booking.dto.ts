import { IsNotEmpty, IsString, IsNumber, IsEnum, IsOptional, ValidateNested, Min, IsMongoId } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '../schemas/booking.schema';

class CoordinatesDto {
  @ApiProperty({ example: 28.6139, description: 'Latitude coordinate' })
  @IsNumber()
  @IsNotEmpty()
  lat: number;

  @ApiProperty({ example: 77.2090, description: 'Longitude coordinate' })
  @IsNumber()
  @IsNotEmpty()
  lng: number;
}

class LocationDto {
  @ApiProperty({ example: '123 Main Street, New Delhi', description: 'Human-readable address' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({ type: CoordinatesDto })
  @ValidateNested()
  @Type(() => CoordinatesDto)
  coordinates: CoordinatesDto;
}

class DistanceDto {
  @ApiProperty({ example: '5.2 km', description: 'Human-readable distance' })
  @IsString()
  @IsNotEmpty()
  text: string;

  @ApiProperty({ example: 5200, description: 'Distance in meters' })
  @IsNumber()
  @Min(0)
  value: number;
}

class DurationDto {
  @ApiProperty({ example: '15 mins', description: 'Human-readable duration' })
  @IsString()
  @IsNotEmpty()
  text: string;

  @ApiProperty({ example: 900, description: 'Duration in seconds' })
  @IsNumber()
  @Min(0)
  value: number;
}

export class CreateBookingDto {
  @ApiProperty({ type: LocationDto, description: 'Pickup location' })
  @ValidateNested()
  @Type(() => LocationDto)
  @IsNotEmpty()
  origin: LocationDto;

  @ApiProperty({ type: LocationDto, description: 'Drop-off location' })
  @ValidateNested()
  @Type(() => LocationDto)
  @IsNotEmpty()
  destination: LocationDto;

  @ApiProperty({ type: DistanceDto, description: 'Trip distance' })
  @ValidateNested()
  @Type(() => DistanceDto)
  @IsNotEmpty()
  distance: DistanceDto;

  @ApiProperty({ type: DurationDto, description: 'Estimated trip duration' })
  @ValidateNested()
  @Type(() => DurationDto)
  @IsNotEmpty()
  duration: DurationDto;

  @ApiPropertyOptional({ example: '507f1f77bcf86cd799439011', description: 'Pre-selected vehicle ID (optional)' })
  @IsOptional()
  @IsString()
  vehicleId?: string;

  @ApiPropertyOptional({ example: '507f1f77bcf86cd799439012', description: 'Pre-selected driver ID (optional)' })
  @IsOptional()
  @IsString()
  driverId?: string;

  @ApiPropertyOptional({ example: 'SUV', description: 'Selected vehicle type for fare and driver matching' })
  @IsOptional()
  @IsString()
  vehicleType?: string;

  @ApiPropertyOptional({ enum: PaymentMethod, example: PaymentMethod.CASH, default: PaymentMethod.CASH })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ example: '2026-02-20T15:30:00.000Z', description: 'Schedule booking for later (ISO 8601)' })
  @IsOptional()
  @IsString()
  scheduledAt?: string;

  @ApiPropertyOptional({ example: 'Please arrive at back entrance', description: 'Additional instructions' })
  @IsOptional()
  @IsString()
  notes?: string;
}
