import { IsEnum, IsOptional, IsString } from 'class-validator';

export class VehicleVerificationDto {
  @IsOptional()
  @IsEnum(['PENDING', 'APPROVED', 'REJECTED'])
  verificationStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  verificationNotes?: string;
}
