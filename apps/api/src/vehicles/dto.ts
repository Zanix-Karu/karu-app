import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
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
}
