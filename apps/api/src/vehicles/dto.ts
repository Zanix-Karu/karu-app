import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MaxLength,
} from 'class-validator';
import {
  DRIVER_OPTIONS,
  FUEL_TYPES,
  PHOTO_ANGLES,
  type City,
  type DriverOption,
  type FuelType,
  type PhotoAngle,
  type Transmission,
  type VehicleCategory,
  type VehicleStatus,
} from '@karu/shared';

const CATEGORIES: VehicleCategory[] = ['economy', 'sedan', 'suv', 'pickup', 'van', 'luxury'];
const CITIES: City[] = ['douala', 'yaounde', 'other'];
const TRANSMISSIONS: Transmission[] = ['manual', 'automatic'];

export class CreateVehicleDto {
  @IsString() @MaxLength(60) make!: string;
  @IsString() @MaxLength(60) model!: string;

  // Year, seats, plate and fuel are required listing facts in the onboarding
  // spec — a customer can't judge a car without them, and admins match the
  // plate against the carte grise during review.
  @Type(() => Number) @IsInt() @Min(1980) @Max(2100) year!: number;

  @IsIn(CATEGORIES) category!: VehicleCategory;

  @Type(() => Number) @IsInt() @Min(1) @Max(50) seats!: number;

  @IsOptional() @IsIn(TRANSMISSIONS) transmission?: Transmission;

  @IsString() @MaxLength(20) registration_number!: string;

  @IsIn(FUEL_TYPES) fuel_type!: FuelType;

  @IsInt() @Min(1) daily_rate_xaf!: number;

  /** Optional longer-term rates; omitted = the car charges daily x days. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) weekly_rate_xaf?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) monthly_rate_xaf?: number;

  @IsIn(CITIES) city!: City;

  /**
   * Most cars in Douala and Yaounde are rented with a driver, so this is a
   * first-class listing attribute rather than a note in the description.
   */
  @IsOptional() @IsIn(DRIVER_OPTIONS) driver_option?: DriverOption;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) driver_daily_rate_xaf?: number;

  @IsOptional() @IsArray() @IsString({ each: true }) pickup_locations?: string[];
  @IsOptional() @IsString() description?: string;
}

export class BrowseVehiclesQuery {
  @IsOptional() @IsIn(CITIES) city?: City;
  @IsOptional() @IsIn(CATEGORIES) category?: VehicleCategory;
  @IsOptional() @IsIn(TRANSMISSIONS) transmission?: Transmission;

  /** Minimum seat count (passenger count fits if seats >= this). */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) seats?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) min_price?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) max_price?: number;

  /**
   * Only cars that can be rented with a driver. For a customer booking from
   * abroad for family at home this is usually the first filter applied, not
   * an afterthought.
   */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  with_driver?: boolean;

  /** Both required together to filter by availability window (inclusive). */
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;

  @IsOptional() @IsIn(['price_asc', 'price_desc', 'newest']) sort?:
    | 'price_asc'
    | 'price_desc'
    | 'newest';

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;

  /** Restrict to one vendor's fleet (vendor directory profile pages). */
  @IsOptional() @IsUUID() vendor_id?: string;
}

/**
 * Every field optional — a vendor edits one thing at a time. vendor_id is
 * deliberately absent so a listing can never be moved to another vendor.
 */
export class UpdateVehicleDto {
  @IsOptional() @IsString() @MaxLength(60) make?: string;
  @IsOptional() @IsString() @MaxLength(60) model?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1980) @Max(2100) year?: number;
  @IsOptional() @IsIn(CATEGORIES) category?: VehicleCategory;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) seats?: number;
  @IsOptional() @IsIn(TRANSMISSIONS) transmission?: Transmission;
  @IsOptional() @IsString() @MaxLength(20) registration_number?: string;
  @IsOptional() @IsIn(FUEL_TYPES) fuel_type?: FuelType;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) daily_rate_xaf?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) weekly_rate_xaf?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) monthly_rate_xaf?: number;
  @IsOptional() @IsIn(DRIVER_OPTIONS) driver_option?: DriverOption;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) driver_daily_rate_xaf?: number;
  @IsOptional() @IsIn(CITIES) city?: City;
  @IsOptional() @IsArray() @IsString({ each: true }) pickup_locations?: string[];
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsIn(['draft', 'active', 'inactive']) status?: VehicleStatus;
}

export class CreateBlockDto {
  @IsDateString() start_date!: string;
  @IsDateString() end_date!: string;
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
}

export class AvailabilityQuery {
  @IsDateString() from!: string;
  @IsDateString() to!: string;
}

export class UploadPhotoDto {
  @IsString()
  @MaxLength(120)
  file_name!: string;
}

export class AttachPhotoDto {
  /** Storage path returned by the upload endpoint. */
  @IsString()
  @MaxLength(300)
  path!: string;

  /**
   * Which required slot this photo fills (front, rear, …). Omitted = an
   * extra gallery shot. Re-attaching an angle replaces that slot's photo.
   */
  @IsOptional()
  @IsIn(PHOTO_ANGLES)
  angle?: PhotoAngle;
}

export class RemovePhotoDto {
  /** The photo's public URL exactly as it appears on the listing. */
  @IsString()
  @MaxLength(500)
  url!: string;
}
