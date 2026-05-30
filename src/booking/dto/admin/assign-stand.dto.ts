import { IsOptional, IsString } from 'class-validator';

export class AssignStandDto {
  @IsOptional()
  @IsString()
  assignedStandId?: string;
}
