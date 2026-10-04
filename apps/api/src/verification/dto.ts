import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CUSTOMER_DOCUMENT_TYPES, type CustomerDocumentType } from '@karu/shared';

export class CustomerDocumentUploadDto {
  @IsIn(CUSTOMER_DOCUMENT_TYPES) type!: CustomerDocumentType;
  @IsString() @MaxLength(200) file_name!: string;
}

export class AttachCustomerDocumentDto {
  @IsIn(CUSTOMER_DOCUMENT_TYPES) type!: CustomerDocumentType;
  @IsString() @MaxLength(300) path!: string;
}

export class SubmitVerificationDto {
  @IsDateString() date_of_birth!: string;
  @IsDateString() licence_expires_at!: string;
}

export class ReviewVerificationDto {
  @IsIn(['verified', 'rejected']) decision!: 'verified' | 'rejected';
  /** Required for a rejection: the customer needs to know what to fix. */
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
