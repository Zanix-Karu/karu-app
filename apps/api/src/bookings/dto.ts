import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import type { BookingStatus } from '@karu/shared';

export class CreateBookingDto {
  @IsUUID() vehicle_id!: string;
  @IsDateString() start_date!: string; // YYYY-MM-DD
  @IsDateString() end_date!: string;
  @IsOptional() @IsString() @MaxLength(160) pickup_location?: string;
  @IsOptional() @IsString() @MaxLength(500) customer_note?: string;
}

// Targets a client may request. 'requested' is never a valid target.
const TRANSITION_TARGETS: BookingStatus[] = [
  'confirmed',
  'rejected',
  'cancelled',
  'in_progress',
  'completed',
];

export class TransitionBookingDto {
  @IsIn(TRANSITION_TARGETS) status!: BookingStatus;
  @IsOptional() @IsString() @MaxLength(500) vendor_note?: string;
}

export class RelayMessageDto {
  @IsString()
  @MaxLength(2000)
  message!: string;
}
