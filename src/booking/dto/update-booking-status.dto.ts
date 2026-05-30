import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingStatus } from '../schemas/booking.schema';

export class UpdateBookingStatusDto {
  @ApiProperty({
    enum: BookingStatus,
    example: BookingStatus.ACCEPTED,
    description: 'New booking status',
  })
  @IsEnum(BookingStatus)
  status: BookingStatus;

  @ApiPropertyOptional({
    example: 'Customer requested cancellation',
    description: 'Reason for cancellation (required if status is CANCELLED)',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  cancelReason?: string;
}
