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

  /**
   * Start a verification-document upload. Issues a one-time signed upload URL
   * for the private bucket and upserts the vendor_documents row back to
   * 'pending' (re-uploading a rejected document restarts its review). The
   * file itself goes browser → storage directly; it never streams through
   * the API.
   */
  async createDocumentUpload(profileId: string, type: DocumentType) {
    const vendor = await this.getByProfile(profileId);
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

  /** Public directory of verified vendors, each with its aggregate rating. */
  async listVerified(): Promise<Array<Vendor & { rating: RatingSummary }>> {
    const { data, error } = await this.supabase.db
      .from('vendors')
      .select('*')
      .eq('status', 'verified')
      .order('created_at', { ascending: false });
    if (error) throw new NotFoundException(error.message);

    const vendors = (data ?? []) as Vendor[];
    const ratings = await this.reviews.summaryByVendor(vendors.map((v) => v.id));
    return vendors.map((v) => ({ ...v, rating: ratings[v.id] }));
  }
}
