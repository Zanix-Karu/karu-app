import {
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import type { DocumentStatus, VendorStatus } from '@karu/shared';
import { CreateVehicleDto } from '../vehicles/dto';
import { NormalizeEmail } from '../lib/normalize';

const VENDOR_STATUSES: VendorStatus[] = ['pending', 'verified', 'rejected', 'suspended'];
const DOCUMENT_DECISIONS: DocumentStatus[] = ['approved', 'rejected'];

export class SetVendorStatusDto {
  @IsIn(VENDOR_STATUSES)
  status!: VendorStatus;
}

export class ReviewDocumentDto {
  @IsIn(DOCUMENT_DECISIONS)
  status!: DocumentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  /** Reviewer-confirmed expiry date, read off the certificate itself. */
  @IsOptional()
  @IsDateString()
  expires_at?: string;
}

/**
 * Team-onboarded vendor (MVP: we add supply by hand). Creates the auth user
 * (no password — they sign in later via reset/magic link), the profile, and
 * the vendor row in one go.
 */
export class AdminCreateVendorDto {
  // This email creates the Supabase Auth user directly (server-side, no
  // client normalisation runs first), so REQ-7's whitespace/case guard
  // matters here more than anywhere else in this file.
  @NormalizeEmail()
  @IsEmail()
  contact_email!: string;

  @IsString()
  @MaxLength(160)
  business_name!: string;

  @IsIn(['douala', 'yaounde', 'other'])
  city!: 'douala' | 'yaounde' | 'other';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  full_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  contact_phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  whatsapp_number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  rccm_number?: string;

  @IsOptional()
  @IsIn(['en', 'fr'])
  locale?: 'en' | 'fr';
}

/** Team-added car for an existing vendor; drafts until its photos are in. */
export class AdminCreateVehicleDto extends CreateVehicleDto {
  @IsUUID()
  vendor_id!: string;

  @IsOptional()
  @IsIn(['draft', 'active', 'inactive'])
  status?: 'draft' | 'active' | 'inactive';
}

export class CreateVehicleBlockDto {
  @IsUUID()
  vehicle_id!: string;

  @IsDateString()
  start_date!: string;

  @IsDateString()
  end_date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
