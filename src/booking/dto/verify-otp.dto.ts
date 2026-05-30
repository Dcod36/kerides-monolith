import { IsString, IsNotEmpty, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyOtpDto {
  @ApiProperty({
    example: '1234',
    description: '4-digit OTP code',
    minLength: 4,
    maxLength: 4,
  })
  @IsString()
  @IsNotEmpty()
  @Length(4, 4, { message: 'OTP must be exactly 4 digits' })
  @Matches(/^\d{4}$/, { message: 'OTP must contain only digits' })
  otp: string;
}

export class GenerateOtpDto {
  @ApiProperty({
    example: '507f1f77bcf86cd799439011',
    description: 'Booking ID to generate OTP for',
  })
  @IsString()
  @IsNotEmpty()
  bookingId: string;
}
