import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export class DriverVerificationDto {
  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;

  @IsOptional()
  @IsEnum(['PENDING', 'APPROVED', 'REJECTED'])
  verificationStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  verificationNotes?: string;
}
