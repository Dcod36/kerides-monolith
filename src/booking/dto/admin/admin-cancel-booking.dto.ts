import { IsOptional, IsString } from 'class-validator';

export class AdminCancelBookingDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
