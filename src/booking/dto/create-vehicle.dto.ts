import { IsString, IsNumber, IsEnum, Min, Max, IsOptional, IsDateString, ValidateNested, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

class FareStructureDto {
  @IsNumber()
  @Min(0)
  minimumFare: number;

  @IsNumber()
  @Min(0)
  perKilometerRate: number;

  @IsNumber()
  @Min(0)
  waitingChargePerMinute: number;
}

class VehicleDocumentsDto {
  @IsOptional()
  @IsString()
  insurance?: string;

  @IsOptional()
  @IsString()
  rc?: string;

  @IsOptional()
  @IsString()
  permit?: string;

  @IsOptional()
  @IsString()
  fitness?: string;
}

export class CreateVehicleDto {
  @IsString()
  make: string;

  @IsString()
  vehicleModel: string; // renamed from 'model'

  @IsNumber()
  @Min(1990)
  @Max(new Date().getFullYear() + 1)
  year: number;

  @IsString()
  registrationNumber: string;

  @IsEnum(['AUTO', 'BIKE', 'HATCHBACK', 'SEDAN', 'SUV'])
  type: string;

  @IsNumber()
  @Min(1)
  @Max(8)
  seatingCapacity: number;

  @IsString()
  @IsOptional()
  color?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  vehicleImages?: string[];

  @IsDateString()
  @IsOptional()
  insuranceExpiryDate?: string;

  @IsDateString()
  @IsOptional()
  rcExpiryDate?: string;

  @ValidateNested()
  @Type(() => VehicleDocumentsDto)
  @IsOptional()
  documents?: VehicleDocumentsDto;

  @ValidateNested()
  @Type(() => FareStructureDto)
  @IsOptional()
  fareStructure?: FareStructureDto;
}
