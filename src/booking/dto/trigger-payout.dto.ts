import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class TriggerPayoutDto {
  @ApiPropertyOptional({ description: 'If omitted, full available balance is paid out' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;

  @ApiPropertyOptional({ description: 'Destination UPI for payout (fallback when no saved payout details)' })
  @IsOptional()
  @IsString()
  upiId?: string;

  @ApiPropertyOptional({ description: 'Free text note for manual payout ops' })
  @IsOptional()
  @IsString()
  note?: string;
}
