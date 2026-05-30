import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateRefundDto {
  @ApiPropertyOptional({ description: 'Partial refund amount. If omitted, full payment amount is refunded.' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;

  @ApiPropertyOptional({ description: 'Refund reason for audit trail' })
  @IsOptional()
  @IsString()
  reason?: string;
}
