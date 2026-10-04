import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  DELIVERY_TYPES,
  MAX_INSPECTION_PHOTOS,
  type BookingStatus,
  type DeliveryType,
  type InspectionStage,
} from '@karu/shared';

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
  /** 0034: where to bring the car, as a map pin, plus directions in words. */
  @IsOptional() @IsLatitude() delivery_lat?: number;
  @IsOptional() @IsLongitude() delivery_lng?: number;
  @IsOptional() @IsString() @MaxLength(300) delivery_landmark?: string;
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
  /** REQ-6: the handover/return code a vendor read back from the customer. */
  @IsOptional() @IsString() @MaxLength(10) code?: string;
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

export class InspectionUploadDto {
  @IsString() @MaxLength(200) file_name!: string;
}

/** A condition report (0030). Photos are uploaded first, then their paths sent here. */
export class RecordInspectionDto {
  @IsIn(['handover', 'return']) stage!: InspectionStage;
  @IsArray()
  @ArrayMaxSize(MAX_INSPECTION_PHOTOS)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  photo_paths!: string[];
  /** Eighths of a tank, the way the gauge reads. */
  @IsOptional() @IsInt() @Min(0) @Max(8) fuel_eighths?: number;
  @IsOptional() @IsInt() @Min(0) @Max(2_000_000) odometer_km?: number;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
