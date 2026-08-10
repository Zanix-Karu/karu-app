import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DocumentType, RatingSummary, Vendor } from '@karu/shared';
import { SupabaseService } from '../supabase/supabase.service';
import { ReviewsService } from '../reviews/reviews.service';
import { CreateVendorDto } from './dto';

/** Private bucket for verification documents — access via signed URLs only. */
const DOCUMENTS_BUCKET = 'vendor-documents';

@Injectable()
export class VendorsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly reviews: ReviewsService,
  ) {}

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

    // The signup forms don't ask for a contact email — the person registering
    // already typed one to create the account. Defaulting here is what keeps
    // vendor rows from silently ending up with no email at all.
    let contactEmail = dto.contact_email ?? null;
    if (!contactEmail) {
      const { data: authUser } = await this.supabase.db.auth.admin.getUserById(profileId);
      contactEmail = authUser?.user?.email ?? null;
    }

    const { data, error } = await this.supabase.db
      .from('vendors')
      .insert({ ...dto, contact_email: contactEmail, profile_id: profileId })
      .select('*')
      .single();
    if (error || !data) throw new ConflictException(error?.message ?? 'Could not create vendor');

    await this.supabase.db.from('profiles').update({ role: 'vendor' }).eq('id', profileId);
    return data as Vendor;
  }

  /**
   * Edit the calling provider's own record. Status is deliberately absent:
   * verification is Karu's decision, never the provider's.
   */
  async updateByProfile(profileId: string, patch: Record<string, unknown>): Promise<Vendor> {
    const vendor = await this.getByProfile(profileId);
    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('Nothing to update');
    }
    const { data, error } = await this.supabase.db
      .from('vendors')
      .update(patch)
      .eq('id', vendor.id)
      .select('*')
      .single();
    if (error || !data) throw new BadRequestException(error?.message ?? 'Could not update vendor');
    return data as Vendor;
  }

  /** The vendor behind a vehicle — used when pricing driver and delivery. */
  async getById(vendorId: string): Promise<Vendor> {
    const { data, error } = await this.supabase.db
      .from('vendors')
      .select('*')
      .eq('id', vendorId)
      .maybeSingle();
    if (error || !data) throw new NotFoundException('Vendor not found');
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

  /**
   * Start a verification-document upload. Issues a one-time signed upload URL
   * for the private bucket and upserts the vendor_documents row back to
   * 'pending' (re-uploading a rejected document restarts its review). The
   * file itself goes browser → storage directly; it never streams through
   * the API.
   */
  async createDocumentUpload(profileId: string, type: DocumentType) {
    const vendor = await this.getByProfile(profileId);
    return this.createDocumentUploadForVendor(vendor.id, type);
  }

  /**
   * Same flow keyed by vendor id — the admin path. The team collects paperwork
   * over WhatsApp and by hand during onboarding, so an admin must be able to
   * file it against the vendor's record themselves.
   */
  async createDocumentUploadForVendor(vendorId: string, type: DocumentType) {
    const vendor = await this.getById(vendorId); // 404 for unknown vendors
    const path = `${vendor.id}/${type}-${randomUUID()}`;

    const { data: upload, error: storageError } = await this.supabase.db.storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUploadUrl(path);
    if (storageError || !upload) {
      throw new BadRequestException(storageError?.message ?? 'Could not create upload URL');
    }

    const { data, error } = await this.supabase.db
      .from('vendor_documents')
      .upsert(
        { vendor_id: vendor.id, type, file_path: path, status: 'pending' },
        { onConflict: 'vendor_id,type' },
      )
      .select('*')
      .single();
    if (error || !data) throw new BadRequestException(error?.message ?? 'Could not record document');

    return {
      document: data,
      upload: { path: upload.path, token: upload.token, signedUrl: upload.signedUrl },
    };
  }

  /**
   * Everything the vendor dashboard shows, in one request. Each figure is
   * derived from real rows — nothing here is decorative:
   *   - earnings: completed bookings only
   *   - responseRate: share of decided requests answered within 24h, using
   *     requested_at -> confirmed_at (the only response timestamps we hold)
   *   - fleet: a car is 'booked' if a confirmed/in-progress booking covers
   *     today, 'unavailable' if inactive or blocked today, else 'available'
   *   - earningsSeries: completed bookings per day for the last 30 days
   */
  async statsForVendorId(vendorId: string) {
    const { data } = await this.supabase.db
      .from('vendors')
      .select('*')
      .eq('id', vendorId)
      .maybeSingle();
    if (!data) throw new NotFoundException('Vendor not found');
    return this.buildStats(data as Vendor);
  }

  async statsFor(profileId: string) {
    const vendor = await this.getByProfile(profileId);
    return this.buildStats(vendor);
  }

  private async buildStats(vendor: Vendor) {
    const today = new Date().toISOString().slice(0, 10);

    const [bookingsRes, vehiclesRes, blocksRes] = await Promise.all([
      this.supabase.db.from('bookings').select('*').eq('vendor_id', vendor.id),
      this.supabase.db.from('vehicles').select('id, status').eq('vendor_id', vendor.id),
      this.supabase.db
        .from('vehicle_blocks')
        .select('vehicle_id')
        .lte('start_date', today)
        .gte('end_date', today),
    ]);
    if (bookingsRes.error) throw new BadRequestException(bookingsRes.error.message);
    if (vehiclesRes.error) throw new BadRequestException(vehiclesRes.error.message);

    const bookings = (bookingsRes.data ?? []) as Array<{
      status: string;
      total_xaf: number;
      vehicle_id: string;
      start_date: string;
      end_date: string;
      requested_at: string;
      confirmed_at: string | null;
      created_at: string;
    }>;
    const vehicles = (vehiclesRes.data ?? []) as Array<{ id: string; status: string }>;
    const blockedToday = new Set((blocksRes.data ?? []).map((b) => b.vehicle_id as string));

    const completed = bookings.filter((b) => b.status === 'completed');
    const holdingToday = new Set(
      bookings
        .filter(
          (b) =>
            (b.status === 'confirmed' || b.status === 'in_progress') &&
            b.start_date <= today &&
            b.end_date >= today,
        )
        .map((b) => b.vehicle_id),
    );

    // Response rate over requests the vendor actually decided.
    const decided = bookings.filter((b) => b.status !== 'requested');
    const answeredFast = decided.filter((b) => {
      if (!b.confirmed_at) return false;
      const ms = Date.parse(b.confirmed_at) - Date.parse(b.requested_at);
      return ms >= 0 && ms <= 24 * 3600 * 1000;
    });

    const since = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
    const perDay = new Map<string, number>();
    for (const b of completed) {
      const day = b.created_at.slice(0, 10);
      if (day >= since) perDay.set(day, (perDay.get(day) ?? 0) + b.total_xaf);
    }
    const earningsSeries: Array<{ day: string; xaf: number }> = [];
    for (let i = 29; i >= 0; i--) {
      const day = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      earningsSeries.push({ day, xaf: perDay.get(day) ?? 0 });
    }

    return {
      earningsXaf: completed.reduce((s, b) => s + b.total_xaf, 0),
      completedCount: completed.length,
      requestedCount: bookings.filter((b) => b.status === 'requested').length,
      upcomingCount: bookings.filter((b) => b.status === 'confirmed').length,
      responseRate: decided.length ? Math.round((answeredFast.length / decided.length) * 100) : null,
      decidedCount: decided.length,
      fleet: {
        total: vehicles.length,
        available: vehicles.filter(
          (v) => v.status === 'active' && !holdingToday.has(v.id) && !blockedToday.has(v.id),
        ).length,
        booked: vehicles.filter((v) => holdingToday.has(v.id)).length,
        unavailable: vehicles.filter(
          (v) => v.status !== 'active' || (blockedToday.has(v.id) && !holdingToday.has(v.id)),
        ).length,
      },
      earningsSeries,
    };
  }

  /**
   * Public directory of operating vendors (verified and pending — the badge
   * marks verification, it doesn't gate operating), each with its aggregate
   * rating. Rejected and suspended vendors stay out.
   */
  async listPublic(): Promise<Array<Vendor & { rating: RatingSummary }>> {
    const { data, error } = await this.supabase.db
      .from('vendors')
      .select('*')
      .in('status', ['verified', 'pending'])
      .order('created_at', { ascending: false });
    if (error) throw new NotFoundException(error.message);

    const vendors = (data ?? []) as Vendor[];
    const ratings = await this.reviews.summaryByVendor(vendors.map((v) => v.id));
    return vendors.map((v) => ({ ...v, rating: ratings[v.id] }));
  }
}
