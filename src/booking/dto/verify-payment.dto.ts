import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyPaymentDto {
  @ApiProperty({ example: 'order_Qx...' })
  @IsString()
  @IsNotEmpty()
  razorpayOrderId: string;

  @ApiProperty({ example: 'pay_Qx...' })
  @IsString()
  @IsNotEmpty()
  razorpayPaymentId: string;

  @ApiProperty({ example: 'f0f4eb...' })
  @IsString()
  @IsNotEmpty()
  razorpaySignature: string;
}
