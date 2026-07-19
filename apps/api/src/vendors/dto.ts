import { IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { City } from '@karu/shared';

const CITIES: City[] = ['douala', 'yaounde', 'other'];

export class CreateVendorDto {
  @IsString()
  @MaxLength(160)
  business_name!: string;

  @IsIn(CITIES)
  city!: City;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  rccm_number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  contact_phone?: string;

  @IsOptional()
  @IsEmail()
  contact_email?: string;
}
