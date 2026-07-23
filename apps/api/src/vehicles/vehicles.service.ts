import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { UserRole, Vehicle } from '@karu/shared';
import { SupabaseService } from '../supabase/supabase.service';
import { VendorsService } from '../vendors/vendors.service';
import { BrowseVehiclesQuery, CreateVehicleDto } from './dto';

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

  /** Public browse: only active vehicles, optionally filtered. */
  async browse(query: BrowseVehiclesQuery): Promise<Vehicle[]> {
    let q = this.supabase.db.from('vehicles').select('*').eq('status', 'active');
    if (query.city) q = q.eq('city', query.city);
    if (query.category) q = q.eq('category', query.category);
    const { data, error } = await q.order('daily_rate_xaf', { ascending: true });
    if (error) throw new NotFoundException(error.message);
    return (data ?? []) as Vehicle[];
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
