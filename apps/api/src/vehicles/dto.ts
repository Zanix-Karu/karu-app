import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MaxLength,
} from 'class-validator';
import type { City, Transmission, VehicleCategory } from '@karu/shared';

const CATEGORIES: VehicleCategory[] = ['economy', 'sedan', 'suv', 'pickup', 'van', 'luxury'];
const CITIES: City[] = ['douala', 'yaounde', 'other'];
const TRANSMISSIONS: Transmission[] = ['manual', 'automatic'];

export class CreateVehicleDto {
  @IsString() @MaxLength(60) make!: string;
  @IsString() @MaxLength(60) model!: string;

  @IsOptional() @IsInt() @Min(1980) year?: number;

  @IsIn(CATEGORIES) category!: VehicleCategory;

  @IsOptional() @IsInt() @Min(1) seats?: number;

  @IsOptional() @IsIn(TRANSMISSIONS) transmission?: Transmission;

  @IsInt() @Min(1) daily_rate_xaf!: number;

  @IsIn(CITIES) city!: City;

  @IsOptional() @IsArray() @IsString({ each: true }) pickup_locations?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) photos?: string[];
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

  /** Both required together to filter by availability window (inclusive). */
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;

  @IsOptional() @IsIn(['price_asc', 'price_desc', 'newest']) sort?:
    | 'price_asc'
    | 'price_desc'
    | 'newest';

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
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
}
