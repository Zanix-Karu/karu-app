import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { DELIVERY_TYPES, type BookingStatus, type DeliveryType } from '@karu/shared';

export class CreateBookingDto {
  @IsUUID() vehicle_id!: string;
  @IsDateString() start_date!: string; // YYYY-MM-DD
  @IsDateString() end_date!: string;
  @IsOptional() @IsString() @MaxLength(160) pickup_location?: string;
  @IsOptional() @IsString() @MaxLength(500) customer_note?: string;

  /** Chauffeur-driven rental. Rejected if the car doesn't offer a driver. */
  @IsOptional() @IsBoolean() with_driver?: boolean;

  @IsOptional() @IsIn(DELIVERY_TYPES) delivery_type?: DeliveryType;
  /** Street address, or terminal and flight for an airport meet. */
  @IsOptional() @IsString() @MaxLength(300) delivery_address?: string;
  /** HH:MM. A flight lands at a time, not a date. */
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'pickup_time must be HH:MM' })
  pickup_time?: string;
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

export class RequestAssistanceDto {
  /** Optional one-liner on what they need. Short on purpose: the thread
   *  carries the detail, this is just what an admin sees in the queue. */
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}
