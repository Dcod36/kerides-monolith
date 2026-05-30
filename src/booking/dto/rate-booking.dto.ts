import { IsNumber, IsString, IsOptional, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RateBookingDto {
  @ApiProperty({ example: 5, description: 'Rating from 1 to 5', minimum: 1, maximum: 5 })
  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ example: 'Great driver, very professional!', description: 'Optional feedback text' })
  @IsOptional()
  @IsString()
  feedback?: string;
}
