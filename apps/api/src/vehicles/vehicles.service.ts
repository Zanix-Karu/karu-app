import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  missingPhotoAngles,
  type PhotoAngle,
  type UserRole,
  type Vehicle,
  type VehicleDetail,
} from '@karu/shared';
import { SupabaseService } from '../supabase/supabase.service';
import { dbErrorMessage } from '../supabase/db-error';
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

/** Mirrors the bucket's own allowed_mime_types (0026); belt and braces. */
const ALLOWED_PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

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
    if (error || !data) throw new NotFoundException(dbErrorMessage(error, 'Could not create vehicle'));
    return data as Vehicle;
  }

  /**
   * Public browse: active vehicles of verified vendors, filterable by
   * city / category / transmission / seats / price, and — when a date window
   * is given — excluding vehicles that are booked (confirmed/in_progress) or
   * blocked for any overlapping day.
   *
   * Verification is a gate (onboarding spec §12: vendor approved before going
   * live): pending, rejected and suspended vendors are all hidden.
   */
  async browse(query: BrowseVehiclesQuery): Promise<BrowseResult> {
    let q = this.supabase.db
      // `count: 'exact'` so the UI can show "1–20 of 47" rather than guessing
      // whether another page exists.
      .from('vehicles')
      // SECURITY: explicit columns, never '*'. This route is @Public(), so a
      // new sensitive column would otherwise ship to the world the day it is
      // added — which is how registration_number came to be public.
      .select('id, vendor_id, make, model, year, category, seats, transmission, fuel_type, daily_rate_xaf, weekly_rate_xaf, monthly_rate_xaf, driver_option, driver_daily_rate_xaf, city, pickup_locations, photos, photo_angles, description, status, created_at, updated_at, vendors!inner(status)', { count: 'exact' })
      .eq('status', 'active')
      .eq('vendors.status', 'verified');

    if (query.city) q = q.eq('city', query.city);
    if (query.category) q = q.eq('category', query.category);
    if (query.vendor_id) q = q.eq('vendor_id', query.vendor_id);
    if (query.transmission) q = q.eq('transmission', query.transmission);
    // 'optional' and 'required' both mean "a driver can be had"; only 'none'
    // is excluded.
    if (query.with_driver) q = q.neq('driver_option', 'none');
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
    if (error) throw new BadRequestException(dbErrorMessage(error, 'Could not load vehicles'));
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
    if (bookings.error) throw new BadRequestException(dbErrorMessage(bookings.error, 'Could not check availability'));
    if (blocks.error) throw new BadRequestException(dbErrorMessage(blocks.error, 'Could not check availability'));

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
    if (booked.error) throw new BadRequestException(dbErrorMessage(booked.error, 'Could not load vehicles'));
    if (blocked.error) throw new BadRequestException(dbErrorMessage(blocked.error, 'Could not load vehicles'));
    const ids = [...(booked.data ?? []), ...(blocked.data ?? [])].map((r) => r.vehicle_id);
    return [...new Set(ids)];
  }

  /**
   * The car page's payload: the listing plus exactly enough of the provider to
   * quote delivery — never their phone or email.
   */
  async getPublicDetail(id: string): Promise<VehicleDetail> {
    const { data, error } = await this.supabase.db
      .from('vehicles')
      // SECURITY: same explicit list as browse — the plate stays out of the
      // public payload until pickup.
      .select(
        'id, vendor_id, make, model, year, category, seats, transmission, fuel_type, daily_rate_xaf, weekly_rate_xaf, monthly_rate_xaf, driver_option, driver_daily_rate_xaf, city, pickup_locations, photos, photo_angles, description, status, created_at, updated_at, vendors!inner(id, business_name, city, status, delivery_fee_xaf, airport_fee_xaf)',
      )
      .eq('id', id)
      .single();
    if (error || !data) throw new NotFoundException('Vehicle not found');
    const { vendors, ...vehicle } = data as Record<string, unknown> & { vendors: unknown };
    return { ...vehicle, vendor: vendors } as VehicleDetail;
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
      throw new BadRequestException(dbErrorMessage(error, 'Could not create upload URL'));
    }
    return { path: upload.path, token: upload.token, signedUrl: upload.signedUrl };
  }

  /**
   * Record an uploaded photo on the listing. With an angle it fills (or
   * replaces) that required slot; without one it's an extra gallery shot.
   */
  async attachPhoto(
    vehicleId: string,
    profileId: string,
    role: UserRole,
    path: string,
    angle?: PhotoAngle,
  ): Promise<Vehicle> {
    const vehicle = await this.getOwnedVehicle(vehicleId, profileId, role);
    if (!path.startsWith(`${vehicleId}/`)) {
      throw new BadRequestException('Path does not belong to this vehicle');
    }

    // Attach only what was actually uploaded — recording a URL for an object
    // that never made it to storage puts a permanently broken image on the
    // listing (and, with an angle, silently satisfies the photo gate).
    const objectName = path.slice(vehicleId.length + 1);
    const { data: uploaded } = await this.supabase.db.storage
      .from(PHOTOS_BUCKET)
      .list(vehicleId, { search: objectName, limit: 1 });
    const object = uploaded?.find((o) => o.name === objectName);
    if (!object) {
      throw new BadRequestException('Upload the file first, then attach it');
    }
    const mimetype = object.metadata?.mimetype;
    if (!mimetype || !ALLOWED_PHOTO_MIME_TYPES.has(mimetype)) {
      // The bucket's own allowed_mime_types (0026) should already have
      // rejected this at upload time — this is a defensive second check in
      // case that config is ever missing (e.g. a bucket recreated by hand).
      await this.supabase.db.storage.from(PHOTOS_BUCKET).remove([path]);
      throw new BadRequestException('Uploaded file is not a supported image type');
    }

    const { data: pub } = this.supabase.db.storage.from(PHOTOS_BUCKET).getPublicUrl(path);
    const angles = { ...(vehicle.photo_angles ?? {}) };
    let photos = [...vehicle.photos];

    if (angle) {
      const replaced = angles[angle];
      if (replaced) {
        photos = photos.filter((p) => p !== replaced);
        await this.deleteStoredPhoto(vehicleId, replaced);
      }
      angles[angle] = pub.publicUrl;
    }
    photos.push(pub.publicUrl);

    const { data, error } = await this.supabase.db
      .from('vehicles')
      .update({ photos, photo_angles: angles })
      .eq('id', vehicleId)
      .select('*')
      .single();
    if (error || !data) throw new BadRequestException(dbErrorMessage(error, 'Could not attach photo'));
    return data as Vehicle;
  }

  /**
   * Take a photo off a listing. This is the only sanctioned removal path —
   * PATCH deliberately does not accept `photos`, so listings can only carry
   * URLs minted by the upload/attach flow.
   */
  async removePhoto(vehicleId: string, profileId: string, role: UserRole, url: string): Promise<Vehicle> {
    const vehicle = await this.getOwnedVehicle(vehicleId, profileId, role);
    if (!vehicle.photos.includes(url)) {
      throw new NotFoundException('Photo not found on this vehicle');
    }
    const photos = vehicle.photos.filter((p) => p !== url);
    // If the photo filled a required slot, the slot opens up again.
    const angles = Object.fromEntries(
      Object.entries(vehicle.photo_angles ?? {}).filter(([, u]) => u !== url),
    );

    const { data, error } = await this.supabase.db
      .from('vehicles')
      .update({ photos, photo_angles: angles })
      .eq('id', vehicleId)
      .select('*')
      .single();
    if (error || !data) throw new BadRequestException(dbErrorMessage(error, 'Could not remove photo'));

    await this.deleteStoredPhoto(vehicleId, url);
    return data as Vehicle;
  }

  /**
   * Best-effort deletion of a photo's stored object; the listing row is the
   * source of truth, so a failed storage delete only leaves an orphaned file.
   * Only paths under the vehicle's own prefix are ever touched.
   */
  private async deleteStoredPhoto(vehicleId: string, url: string): Promise<void> {
    const marker = `/object/public/${PHOTOS_BUCKET}/`;
    const markerAt = url.indexOf(marker);
    if (markerAt === -1) return;
    const path = decodeURIComponent(url.slice(markerAt + marker.length));
    if (!path.startsWith(`${vehicleId}/`)) return;
    await this.supabase.db.storage.from(PHOTOS_BUCKET).remove([path]);
  }

  /** Edit a listing. Ownership-checked; vendor_id can never be reassigned. */
  async update(
    vehicleId: string,
    profileId: string,
    role: UserRole,
    patch: Record<string, unknown>,
  ): Promise<Vehicle> {
    const vehicle = await this.getOwnedVehicle(vehicleId, profileId, role);
    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('Nothing to update');
    }

    // Spec §5: a listing can't go live without its six required photos.
    if (patch.status === 'active' && vehicle.status !== 'active') {
      const missing = missingPhotoAngles(vehicle.photo_angles ?? {});
      if (missing.length) {
        throw new BadRequestException(
          `Add the required photos before activating — missing: ${missing.join(', ')}`,
        );
      }
    }

    const { data, error } = await this.supabase.db
      .from('vehicles')
      .update(patch)
      .eq('id', vehicleId)
      .select('*')
      .single();
    if (error || !data) throw new BadRequestException(dbErrorMessage(error, 'Could not update vehicle'));
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
    if (countError) throw new BadRequestException(dbErrorMessage(countError, 'Could not remove vehicle'));

    if ((count ?? 0) > 0) {
      const { error } = await this.supabase.db
        .from('vehicles')
        .update({ status: 'inactive' })
        .eq('id', vehicleId);
      if (error) throw new BadRequestException(dbErrorMessage(error, 'Could not deactivate vehicle'));
      return { removed: false, deactivated: true, bookings: count };
    }

    const { error } = await this.supabase.db.from('vehicles').delete().eq('id', vehicleId);
    if (error) throw new BadRequestException(dbErrorMessage(error, 'Could not remove vehicle'));
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
    if (error) throw new BadRequestException(dbErrorMessage(error, 'Could not load blocks'));
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
      throw new BadRequestException(dbErrorMessage(error, 'Could not create block'));
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
    if (error) throw new BadRequestException(dbErrorMessage(error, 'Could not delete block'));
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

  /**
   * Listings for the calling vendor, in any status. An admin has no vendor
   * record of their own, so they get the whole fleet — a superadmin oversees
   * every vendor's cars, not none.
   */
  async listForVendorProfile(profileId: string, role: UserRole = 'vendor'): Promise<Vehicle[]> {
    let q = this.supabase.db.from('vehicles').select('*');
    if (role !== 'admin') {
      const vendor = await this.vendors.getByProfile(profileId);
      q = q.eq('vendor_id', vendor.id);
    }
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw new NotFoundException(dbErrorMessage(error, 'Could not load vehicles'));
    return (data ?? []) as Vehicle[];
  }
}
