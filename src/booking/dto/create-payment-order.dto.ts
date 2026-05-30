import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum SupportedCheckoutMethod {
  UPI = 'UPI',
  CARD = 'CARD',
  NETBANKING = 'NETBANKING',
  WALLET = 'WALLET',
  CASH = 'CASH',
}

export class CreatePaymentOrderDto {
  @ApiPropertyOptional({ enum: SupportedCheckoutMethod, default: SupportedCheckoutMethod.UPI })
  @IsOptional()
  @IsEnum(SupportedCheckoutMethod)
  paymentMethod?: SupportedCheckoutMethod;

  @ApiPropertyOptional({ description: 'Optional currency override', default: 'INR' })
  @IsOptional()
  @IsString()
  currency?: string;
}
