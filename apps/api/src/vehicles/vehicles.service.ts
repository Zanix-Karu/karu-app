import { Injectable, NotFoundException } from '@nestjs/common';
import type { Vehicle } from '@karu/shared';
import { SupabaseService } from '../supabase/supabase.service';
import { VendorsService } from '../vendors/vendors.service';
import { BrowseVehiclesQuery, CreateVehicleDto } from './dto';

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
