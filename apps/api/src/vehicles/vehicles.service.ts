import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { UserRole, Vehicle } from '@karu/shared';
import { SupabaseService } from '../supabase/supabase.service';
import { VendorsService } from '../vendors/vendors.service';
import { BrowseVehiclesQuery, CreateVehicleDto } from './dto';
import { assertValidWindow } from './dates';

/** A page of listings, plus enough context for the UI to paginate. */
export interface BrowseResult {
  items: Vehicle[];
  total: number;
  limit: number;
  offset: number;
}

/** Public bucket — listing photos are served directly by their public URL. */
const PHOTOS_BUCKET = 'vehicle-photos';

@Injectable()
export class VehiclesService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly vendors: VendorsService,
  ) {}

  /** Create a listing for the calling vendor (starts as a draft). */
  async create(profileId: string, dto: CreateVehicleDto): Promise<Vehicle> {
    const vendor = await this.vendors.getByProfile(profileId);
    const { data, error } = await this.supabase.db
      .from('vehicles')
      .insert({ ...dto, vendor_id: vendor.id })
      .select('*')
      .single();
    if (error || !data) throw new NotFoundException(error?.message ?? 'Could not create vehicle');
    return data as Vehicle;
  }

  /**
   * Public browse: active vehicles of verified vendors only, filterable by
   * city / category / transmission / seats / price, and — when a date window
   * is given — excluding vehicles that are booked (confirmed/in_progress) or
   * blocked for any overlapping day.
   */
  async browse(query: BrowseVehiclesQuery): Promise<BrowseResult> {
    let q = this.supabase.db
      // `count: 'exact'` so the UI can show "1–20 of 47" rather than guessing
      // whether another page exists.
      .from('vehicles')
      .select('*, vendors!inner(status)', { count: 'exact' })
      .eq('status', 'active')
      .eq('vendors.status', 'verified');

    if (query.city) q = q.eq('city', query.city);
    if (query.category) q = q.eq('category', query.category);
    if (query.vendor_id) q = q.eq('vendor_id', query.vendor_id);
    if (query.transmission) q = q.eq('transmission', query.transmission);
    if (query.seats !== undefined) q = q.gte('seats', query.seats);
    if (query.min_price !== undefined) q = q.gte('daily_rate_xaf', query.min_price);
    if (query.max_price !== undefined) q = q.lte('daily_rate_xaf', query.max_price);

    if (query.from || query.to) {
      if (!query.from || !query.to) {
        throw new BadRequestException('Provide both from and to to filter by dates');
      }
      assertValidWindow(query.from, query.to);
      const excluded = await this.vehiclesUnavailableBetween(query.from, query.to);
      if (excluded.length) q = q.not('id', 'in', `(${excluded.join(',')})`);
    }

    const sort = query.sort ?? 'price_asc';
    if (sort === 'newest') q = q.order('created_at', { ascending: false });
    else q = q.order('daily_rate_xaf', { ascending: sort === 'price_asc' });

    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    q = q.range(offset, offset + limit - 1);

    const { data, error, count } = await q;
    if (error) throw new BadRequestException(error.message);
    // Strip the joined vendors column used only for the verified filter.
    const items = (data ?? []).map(({ vendors: _vendors, ...v }) => v) as Vehicle[];
    return { items, total: count ?? items.length, limit, offset };
  }

  /** Can this vehicle be rented for [from, to]? Lists what's in the way if not. */
  async availability(vehicleId: string, from: string, to: string) {
    assertValidWindow(from, to);
    await this.getById(vehicleId); // 404 for unknown vehicles

    const overlap = <T extends string>(table: T, extra: Record<string, unknown> = {}) => {
      let q = this.supabase.db
        .from(table)
        .select('start_date, end_date')
        .eq('vehicle_id', vehicleId)
        .lte('start_date', to)
        .gte('end_date', from);
      for (const [col, val] of Object.entries(extra)) {
        q = q.in(col, val as string[]);
      }
      return q;
    };

    const [bookings, blocks] = await Promise.all([
      overlap('bookings', { status: ['confirmed', 'in_progress'] }),
      overlap('vehicle_blocks'),
    ]);
    if (bookings.error) throw new BadRequestException(bookings.error.message);
    if (blocks.error) throw new BadRequestException(blocks.error.message);

    const conflicts = [...(bookings.data ?? []), ...(blocks.data ?? [])];
    return { available: conflicts.length === 0, conflicts };
  }

  /** Vehicle ids that hold a booking or a block overlapping [from, to]. */
  private async vehiclesUnavailableBetween(from: string, to: string): Promise<string[]> {
    const [booked, blocked] = await Promise.all([
      this.supabase.db
        .from('bookings')
        .select('vehicle_id')
        .in('status', ['confirmed', 'in_progress'])
        .lte('start_date', to)
        .gte('end_date', from),
      this.supabase.db
        .from('vehicle_blocks')
        .select('vehicle_id')
        .lte('start_date', to)
        .gte('end_date', from),
    ]);
    if (booked.error) throw new BadRequestException(booked.error.message);
    if (blocked.error) throw new BadRequestException(blocked.error.message);
    const ids = [...(booked.data ?? []), ...(blocked.data ?? [])].map((r) => r.vehicle_id);
    return [...new Set(ids)];
  }

  async getById(id: string): Promise<Vehicle> {
    const { data, error } = await this.supabase.db
      .from('vehicles')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !data) throw new NotFoundException('Vehicle not found');
    return data as Vehicle;
  }

  /**
   * Start a listing-photo upload: signed upload URL into the public bucket.
   * Once the client has uploaded, it calls attachPhoto with the same path.
   */
  async createPhotoUpload(vehicleId: string, profileId: string, role: UserRole, fileName: string) {
    await this.getOwnedVehicle(vehicleId, profileId, role);
    const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, '_');
    const path = `${vehicleId}/${randomUUID()}-${safeName}`;

    const { data: upload, error } = await this.supabase.db.storage
      .from(PHOTOS_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !upload) {
      throw new BadRequestException(error?.message ?? 'Could not create upload URL');
    }
    return { path: upload.path, token: upload.token, signedUrl: upload.signedUrl };
  }

  /** Record an uploaded photo on the listing (appends its public URL). */
  async attachPhoto(vehicleId: string, profileId: string, role: UserRole, path: string): Promise<Vehicle> {
    const vehicle = await this.getOwnedVehicle(vehicleId, profileId, role);
    if (!path.startsWith(`${vehicleId}/`)) {
      throw new BadRequestException('Path does not belong to this vehicle');
    }

    const { data: pub } = this.supabase.db.storage.from(PHOTOS_BUCKET).getPublicUrl(path);
    const photos = [...vehicle.photos, pub.publicUrl];

    const { data, error } = await this.supabase.db
      .from('vehicles')
      .update({ photos })
      .eq('id', vehicleId)
      .select('*')
      .single();
    if (error || !data) throw new BadRequestException(error?.message ?? 'Could not attach photo');
    return data as Vehicle;
  }

  /** Edit a listing. Ownership-checked; vendor_id can never be reassigned. */
  async update(
    vehicleId: string,
    profileId: string,
    role: UserRole,
    patch: Record<string, unknown>,
  ): Promise<Vehicle> {
    await this.getOwnedVehicle(vehicleId, profileId, role);
    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('Nothing to update');
    }

    const { data, error } = await this.supabase.db
      .from('vehicles')
      .update(patch)
      .eq('id', vehicleId)
      .select('*')
      .single();
    if (error || !data) throw new BadRequestException(error?.message ?? 'Could not update vehicle');
    return data as Vehicle;
  }

  /**
   * Retire a listing. Cars with bookings are never hard-deleted — that would
   * orphan a customer's history (bookings.vehicle_id is ON DELETE RESTRICT
   * for exactly this reason). They are marked 'inactive', which removes them
   * from the public catalogue while leaving every past booking intact. A car
   * that has never been booked is deleted outright.
   */
  async retire(vehicleId: string, profileId: string, role: UserRole) {
    await this.getOwnedVehicle(vehicleId, profileId, role);

    const { count, error: countError } = await this.supabase.db
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('vehicle_id', vehicleId);
    if (countError) throw new BadRequestException(countError.message);

    if ((count ?? 0) > 0) {
      const { error } = await this.supabase.db
        .from('vehicles')
        .update({ status: 'inactive' })
        .eq('id', vehicleId);
      if (error) throw new BadRequestException(error.message);
      return { removed: false, deactivated: true, bookings: count };
    }

    const { error } = await this.supabase.db.from('vehicles').delete().eq('id', vehicleId);
    if (error) throw new BadRequestException(error.message);
    return { removed: true, deactivated: false, bookings: 0 };
  }

  /** Availability blocks for a vehicle (owning vendor or admin). */
  async listBlocks(vehicleId: string, profileId: string, role: UserRole) {
    await this.getOwnedVehicle(vehicleId, profileId, role);
    const { data, error } = await this.supabase.db
      .from('vehicle_blocks')
      .select('*')
      .eq('vehicle_id', vehicleId)
      .order('start_date');
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  /** Block dates a car is unavailable (maintenance, private use, …). */
  async createBlock(
    vehicleId: string,
    profileId: string,
    role: UserRole,
    dto: { start_date: string; end_date: string; reason?: string },
  ) {
    await this.getOwnedVehicle(vehicleId, profileId, role);
    assertValidWindow(dto.start_date, dto.end_date);
    const { data, error } = await this.supabase.db
      .from('vehicle_blocks')
      .insert({ ...dto, vehicle_id: vehicleId, created_by: profileId })
      .select('*')
      .single();
    if (error) {
      if (error.code === '23P01') {
        throw new ConflictException('An overlapping block already exists for this vehicle');
      }
      throw new BadRequestException(error.message);
    }
    return data;
  }

  async deleteBlock(vehicleId: string, blockId: string, profileId: string, role: UserRole) {
    await this.getOwnedVehicle(vehicleId, profileId, role);
    const { error, count } = await this.supabase.db
      .from('vehicle_blocks')
      .delete({ count: 'exact' })
      .eq('id', blockId)
      .eq('vehicle_id', vehicleId);
    if (error) throw new BadRequestException(error.message);
    if (!count) throw new NotFoundException('Block not found');
    return { deleted: true };
  }

  /** The vehicle, if the caller may manage it (owning vendor or admin). */
  private async getOwnedVehicle(vehicleId: string, profileId: string, role: UserRole): Promise<Vehicle> {
    const vehicle = await this.getById(vehicleId);
    if (role === 'admin') return vehicle;
    const vendor = await this.vendors.getByProfile(profileId);
    if (vehicle.vendor_id !== vendor.id) throw new ForbiddenException('Not your vehicle');
    return vehicle;
  }

  /** Vendor's own listings (any status). */
  async listForVendorProfile(profileId: string): Promise<Vehicle[]> {
    const vendor = await this.vendors.getByProfile(profileId);
    const { data, error } = await this.supabase.db
      .from('vehicles')
      .select('*')
      .eq('vendor_id', vendor.id)
      .order('created_at', { ascending: false });
    if (error) throw new NotFoundException(error.message);
    return (data ?? []) as Vehicle[];
  }
}
