import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Booking, Vendor, VendorDocument, Vehicle, VendorStatus } from '@karu/shared';
import { SupabaseService } from '../supabase/supabase.service';
import {
  AdminCreateVehicleDto,
  AdminCreateVendorDto,
  CreateVehicleBlockDto,
  ReviewDocumentDto,
  SetVendorStatusDto,
} from './dto';

@Injectable()
export class AdminService {
  constructor(private readonly supabase: SupabaseService) {}

  /** Ops dashboard counters: what needs attention right now. */
  async overview() {
    const count = async (table: string, filters: Record<string, string> = {}) => {
      let q = this.supabase.db.from(table).select('*', { count: 'exact', head: true });
      for (const [col, val] of Object.entries(filters)) q = q.eq(col, val);
      const { count: n, error } = await q;
      if (error) throw new BadRequestException(error.message);
      return n ?? 0;
    };

    const [pendingVendors, requestedBookings, activeVehicles, customers] = await Promise.all([
      count('vendors', { status: 'pending' }),
      count('bookings', { status: 'requested' }),
      count('vehicles', { status: 'active' }),
      count('profiles', { role: 'customer' }),
    ]);
    return { pendingVendors, requestedBookings, activeVehicles, customers };
  }

  // --- vendor verification ---------------------------------------------------

  async listVendors(status?: VendorStatus): Promise<Vendor[]> {
    let q = this.supabase.db.from('vendors').select('*');
    if (status) q = q.eq('status', status);
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);
    return (data ?? []) as Vendor[];
  }

  /** Verify / reject / suspend a vendor. verified_at is stamped exactly once. */
  async setVendorStatus(vendorId: string, dto: SetVendorStatusDto): Promise<Vendor> {
    const patch: Record<string, unknown> = { status: dto.status };
    if (dto.status === 'verified') patch.verified_at = new Date().toISOString();

    const { data, error } = await this.supabase.db
      .from('vendors')
      .update(patch)
      .eq('id', vendorId)
      .select('*')
      .single();
    if (error || !data) throw new NotFoundException('Vendor not found');
    return data as Vendor;
  }

  /** Documents awaiting (or past) review, with their vendor's name. */
  async listDocuments(status?: 'pending' | 'approved' | 'rejected', vendorId?: string) {
    let q = this.supabase.db
      .from('vendor_documents')
      .select('*, vendors(business_name)');
    if (status) q = q.eq('status', status);
    if (vendorId) q = q.eq('vendor_id', vendorId);
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  /**
   * A short-lived signed URL for a verification document. The bucket is
   * private, so without this an admin is asked to approve an RCCM or
   * insurance certificate they cannot open — the verification gate would be
   * theatre. Five minutes is enough to look and decide.
   */
  async documentDownloadUrl(documentId: string): Promise<{ url: string; expiresIn: number }> {
    const { data: doc, error } = await this.supabase.db
      .from('vendor_documents')
      .select('file_path')
      .eq('id', documentId)
      .maybeSingle();
    if (error || !doc) throw new NotFoundException('Document not found');

    const expiresIn = 300;
    const { data, error: signError } = await this.supabase.db.storage
      .from('vendor-documents')
      .createSignedUrl((doc as { file_path: string }).file_path, expiresIn);
    if (signError || !data) {
      throw new BadRequestException(signError?.message ?? 'Could not create download link');
    }
    return { url: data.signedUrl, expiresIn };
  }

  async reviewDocument(documentId: string, reviewerId: string, dto: ReviewDocumentDto) {
    const { data, error } = await this.supabase.db
      .from('vendor_documents')
      .update({
        status: dto.status,
        notes: dto.notes ?? null,
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', documentId)
      .select('*')
      .single();
    if (error || !data) throw new NotFoundException('Document not found');
    return data as VendorDocument;
  }

  // --- on-behalf supply creation (MVP: the team adds vendors + cars) ---------

  /**
   * Creates auth user (confirmed, passwordless) → profile (via the signup
   * trigger, role 'vendor') → vendor row, already 'verified' since the team
   * has vetted them by hand. The vendor signs in later via password reset.
   */
  async createVendorOnBehalf(dto: AdminCreateVendorDto): Promise<Vendor> {
    const { data: created, error: authError } = await this.supabase.db.auth.admin.createUser({
      email: dto.contact_email,
      email_confirm: true,
      user_metadata: { role: 'vendor', full_name: dto.full_name ?? dto.business_name, locale: dto.locale ?? 'fr' },
    });
    if (authError || !created?.user) {
      throw new ConflictException(authError?.message ?? 'Could not create vendor user');
    }

    const { data, error } = await this.supabase.db
      .from('vendors')
      .insert({
        profile_id: created.user.id,
        business_name: dto.business_name,
        city: dto.city,
        rccm_number: dto.rccm_number ?? null,
        contact_phone: dto.contact_phone ?? null,
        contact_email: dto.contact_email,
        status: 'verified',
        verified_at: new Date().toISOString(),
      })
      .select('*')
      .single();
    if (error || !data) throw new ConflictException(error?.message ?? 'Could not create vendor');
    return data as Vendor;
  }

  /** Team-added car for a vendor; defaults straight to 'active'. */
  async createVehicleOnBehalf(dto: AdminCreateVehicleDto): Promise<Vehicle> {
    const { vendor_id, status, ...rest } = dto;

    const vendor = await this.supabase.db
      .from('vendors')
      .select('id')
      .eq('id', vendor_id)
      .maybeSingle();
    if (!vendor.data) throw new NotFoundException('Vendor not found');

    const { data, error } = await this.supabase.db
      .from('vehicles')
      .insert({ ...rest, vendor_id, status: status ?? 'active' })
      .select('*')
      .single();
    if (error || !data) throw new BadRequestException(error?.message ?? 'Could not create vehicle');
    return data as Vehicle;
  }

  // --- availability blocks ---------------------------------------------------

  async createBlock(createdBy: string, dto: CreateVehicleBlockDto) {
    const { data, error } = await this.supabase.db
      .from('vehicle_blocks')
      .insert({ ...dto, created_by: createdBy })
      .select('*')
      .single();
    // 23P01 = overlap with an existing block (exclusion constraint)
    if (error) {
      if (error.code === '23P01') {
        throw new ConflictException('An overlapping block already exists for this vehicle');
      }
      throw new BadRequestException(error.message);
    }
    return data;
  }

  async deleteBlock(blockId: string) {
    const { error, count } = await this.supabase.db
      .from('vehicle_blocks')
      .delete({ count: 'exact' })
      .eq('id', blockId);
    if (error) throw new BadRequestException(error.message);
    if (!count) throw new NotFoundException('Block not found');
    return { deleted: true };
  }

  // --- bookings oversight ----------------------------------------------------

  async listBookings(status?: Booking['status']): Promise<Booking[]> {
    let q = this.supabase.db.from('bookings').select('*');
    if (status) q = q.eq('status', status);
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw new BadRequestException(error.message);
    return (data ?? []) as Booking[];
  }
}
