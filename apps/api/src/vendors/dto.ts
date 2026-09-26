import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import type { City, DocumentType } from '@karu/shared';
import { NormalizeEmail } from '../lib/normalize';

const CITIES: City[] = ['douala', 'yaounde', 'other'];
const DOCUMENT_TYPES: DocumentType[] = [
  'rccm',
  'national_id',
  'passport',
  'carte_grise',
  'insurance',
  'roadworthiness',
];

export class UploadDocumentDto {
  @IsIn(DOCUMENT_TYPES)
  type!: DocumentType;

  /**
   * The car this paperwork belongs to. Required in spirit for carte grise /
   * insurance / roadworthiness (each legally covers one car); must be absent
   * for business/identity documents. Enforced in the service.
   */
  @IsOptional()
  @IsUUID()
  vehicle_id?: string;

  /** Expiry date (insurance / roadworthiness). Reviewers verify it against the file. */
  @IsOptional()
  @IsDateString()
  expires_at?: string;
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
  @MaxLength(120)
  contact_person?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  contact_phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  whatsapp_number?: string;

  @IsOptional()
  @NormalizeEmail()
  @IsEmail()
  contact_email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  address?: string;

  /**
   * True when the vendor ticked the onboarding declaration (information
   * accurate, vehicles roadworthy, insurance valid, listings kept current).
   * Stored as declaration_accepted_at.
   */
  @IsOptional()
  @IsBoolean()
  declaration_accepted?: boolean;
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
  @IsOptional() @IsString() @MaxLength(120) contact_person?: string;
  @IsOptional() @IsString() @MaxLength(30) contact_phone?: string;
  @IsOptional() @IsString() @MaxLength(30) whatsapp_number?: string;
  @IsOptional() @NormalizeEmail() @IsEmail() contact_email?: string;
  @IsOptional() @IsString() @MaxLength(240) address?: string;
  @IsOptional() @IsInt() @Min(0) delivery_fee_xaf?: number;
  @IsOptional() @IsInt() @Min(0) airport_fee_xaf?: number;
}
