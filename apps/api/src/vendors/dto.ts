import { IsEmail, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import type { City, DocumentType } from '@karu/shared';

const CITIES: City[] = ['douala', 'yaounde', 'other'];
const DOCUMENT_TYPES: DocumentType[] = ['rccm', 'carte_grise', 'insurance', 'roadworthiness'];

export class UploadDocumentDto {
  @IsIn(DOCUMENT_TYPES)
  type!: DocumentType;
}

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

/**
 * A provider editing their own record. Delivery is priced here rather than per
 * car: a rental business either runs cars out to customers or it doesn't, and
 * a different fee per car in the same fleet would be noise for the operator.
 * Omitting a fee means the service isn't offered.
 */
export class UpdateVendorDto {
  @IsOptional() @IsString() @MaxLength(160) business_name?: string;
  @IsOptional() @IsIn(CITIES) city?: City;
  @IsOptional() @IsString() @MaxLength(40) rccm_number?: string;
  @IsOptional() @IsString() @MaxLength(30) contact_phone?: string;
  @IsOptional() @IsEmail() contact_email?: string;
  @IsOptional() @IsInt() @Min(0) delivery_fee_xaf?: number;
  @IsOptional() @IsInt() @Min(0) airport_fee_xaf?: number;
}
