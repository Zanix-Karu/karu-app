import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Vendor } from '@karu/shared';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateVendorDto } from './dto';

@Injectable()
export class VendorsService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Register the authenticated user as a vendor. Creates the vendor row
   * (status='pending', awaiting document verification) and promotes the
   * profile role to 'vendor'.
   */
  async create(profileId: string, dto: CreateVendorDto): Promise<Vendor> {
    const existing = await this.supabase.db
      .from('vendors')
      .select('id')
      .eq('profile_id', profileId)
      .maybeSingle();
    if (existing.data) throw new ConflictException('Vendor already registered');

    const { data, error } = await this.supabase.db
      .from('vendors')
      .insert({ ...dto, profile_id: profileId })
      .select('*')
      .single();
    if (error || !data) throw new ConflictException(error?.message ?? 'Could not create vendor');

    await this.supabase.db.from('profiles').update({ role: 'vendor' }).eq('id', profileId);
    return data as Vendor;
  }

  async getByProfile(profileId: string): Promise<Vendor> {
    const { data, error } = await this.supabase.db
      .from('vendors')
      .select('*')
      .eq('profile_id', profileId)
      .maybeSingle();
    if (error || !data) throw new NotFoundException('No vendor for this account');
    return data as Vendor;
  }

  /** Public directory of verified vendors. */
  async listVerified(): Promise<Vendor[]> {
    const { data, error } = await this.supabase.db
      .from('vendors')
      .select('*')
      .eq('status', 'verified')
      .order('created_at', { ascending: false });
    if (error) throw new NotFoundException(error.message);
    return (data ?? []) as Vendor[];
  }
}
