import { IsString } from 'class-validator';

export class AdminAssignDriverDto {
  @IsString()
  driverId: string;
}
