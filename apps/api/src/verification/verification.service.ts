import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { verificationGaps } from '@karu/shared';
import type { CustomerDocumentType, CustomerVerificationStatus } from '@karu/shared';
import { SupabaseService } from '../supabase/supabase.service';
import { dbErrorMessage } from '../supabase/db-error';
import type { ReviewVerificationDto, SubmitVerificationDto } from './dto';

export const CUSTOMER_DOCS_BUCKET = 'customer-documents';
const PREVIEW_TTL_SECONDS = 600;
/** Mirrors the bucket's allowed_mime_types (0032). */
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

interface DocumentRow {
  id: string;
  profile_id: string;
  type: CustomerDocumentType;
  file_path: string;
  updated_at: string;
}

interface VerificationProfile {
  id: string;
  full_name: string | null;
  verification_status: CustomerVerificationStatus;
  verification_note: string | null;
  verified_at: string | null;
  date_of_birth: string | null;
  licence_expires_at: string | null;
  updated_at: string;
}

const PROFILE_COLUMNS =
  'id, full_name, verification_status, verification_note, verified_at, date_of_birth, licence_expires_at, updated_at';

/**
 * Customer ID verification (0032): the customer's half (upload, submit) and
 * the admin's half (queue, decide). See the migration for why.
 */
@Injectable()
export class VerificationService {
  constructor(private readonly supabase: SupabaseService) {}

  /** The caller's own status and which documents are on file. */
  async mine(profileId: string) {
    const [profile, documents] = await Promise.all([
      this.profile(profileId),
      this.documents(profileId),
    ]);
    return {
      status: profile.verification_status,
      note: profile.verification_note,
      verified_at: profile.verified_at,
      date_of_birth: profile.date_of_birth,
      licence_expires_at: profile.licence_expires_at,
      documents: documents.map((d) => ({ type: d.type, updated_at: d.updated_at })),
      missing: verificationGaps({
        documents: documents.map((d) => d.type),
        dateOfBirth: profile.date_of_birth,
        licenceExpiresAt: profile.licence_expires_at,
      }),
    };
  }

  /** Signed upload URL, namespaced to the customer so nobody can overwrite another's file. */
  async createUpload(profileId: string, type: CustomerDocumentType, fileName: string) {
    const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80) || 'document';
    const path = `${profileId}/${type}-${randomUUID()}-${safe}`;
    const { data, error } = await this.supabase.db.storage
      .from(CUSTOMER_DOCS_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) throw new BadRequestException(dbErrorMessage(error, 'Could not create upload URL'));
    return { path: data.path, token: data.token, signedUrl: data.signedUrl };
  }

  /**
   * Record an uploaded file against its type. Changing a document after a
   * decision sends the check back to the queue: a verified badge must
   * describe the papers actually on file.
   */
  async attach(profileId: string, type: CustomerDocumentType, path: string) {
    if (!path.startsWith(`${profileId}/`)) throw new BadRequestException('Not your upload');
    const objectName = path.slice(profileId.length + 1);
    const { data: objects } = await this.supabase.db.storage
      .from(CUSTOMER_DOCS_BUCKET)
      .list(profileId, { search: objectName, limit: 5 });
    const object = objects?.find((o) => o.name === objectName);
    const mimetype = object?.metadata?.mimetype as string | undefined;
    if (!mimetype || !ALLOWED_MIME_TYPES.has(mimetype)) {
      throw new BadRequestException('Upload a photo (JPEG, PNG, WebP) or a PDF');
    }

    const { error } = await this.supabase.db
      .from('customer_documents')
      .upsert({ profile_id: profileId, type, file_path: path }, { onConflict: 'profile_id,type' });
    if (error) throw new BadRequestException(dbErrorMessage(error, 'Could not save the document'));

    const profile = await this.profile(profileId);
    if (profile.verification_status === 'verified' || profile.verification_status === 'rejected') {
      await this.setStatus(profileId, { verification_status: 'unverified', verified_at: null });
    }
    return this.mine(profileId);
  }

  /** Send everything for review. Refuses until nothing is missing. */
  async submit(profileId: string, dto: SubmitVerificationDto) {
    const today = new Date().toISOString().slice(0, 10);
    if (dto.licence_expires_at.slice(0, 10) < today) {
      throw new BadRequestException('That licence has expired');
    }
    if (dto.date_of_birth.slice(0, 10) >= today) {
      throw new BadRequestException('Check the date of birth');
    }
    const documents = await this.documents(profileId);
    const missing = verificationGaps({
      documents: documents.map((d) => d.type),
      dateOfBirth: dto.date_of_birth,
      licenceExpiresAt: dto.licence_expires_at,
    });
    if (missing.length) {
      throw new BadRequestException(`Still needed: ${missing.join(', ')}`);
    }
    await this.setStatus(profileId, {
      verification_status: 'pending',
      verification_note: null,
      date_of_birth: dto.date_of_birth.slice(0, 10),
      licence_expires_at: dto.licence_expires_at.slice(0, 10),
    });
    return this.mine(profileId);
  }

  // --- admin ----------------------------------------------------------------

  /** The review queue (or any status), oldest first, with signed document URLs. */
  async queue(status: CustomerVerificationStatus = 'pending') {
    const { data, error } = await this.supabase.db
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('verification_status', status)
      .order('updated_at', { ascending: true })
      .limit(100);
    if (error) throw new BadRequestException(dbErrorMessage(error, 'Could not load the queue'));
    const profiles = (data ?? []) as VerificationProfile[];
    return Promise.all(
      profiles.map(async (p) => {
        const docs = await this.documents(p.id);
        return {
          ...p,
          documents: await Promise.all(
            docs.map(async (d) => ({ type: d.type, url: await this.sign(d.file_path) })),
          ),
        };
      }),
    );
  }

  async review(profileId: string, dto: ReviewVerificationDto) {
    const profile = await this.profile(profileId);
    if (profile.verification_status !== 'pending') {
      throw new BadRequestException('Only a pending check can be decided');
    }
    if (dto.decision === 'rejected' && !dto.note?.trim()) {
      throw new BadRequestException('Say what the customer needs to fix');
    }
    await this.setStatus(profileId, {
      verification_status: dto.decision,
      verification_note: dto.decision === 'rejected' ? dto.note!.trim() : null,
      verified_at: dto.decision === 'verified' ? new Date().toISOString() : null,
    });
    return this.profile(profileId);
  }

  /**
   * What a provider sees at the handover: the verified name and the selfie,
   * nothing else. The ID scans themselves never leave the admin console.
   */
  async handoverIdentity(profileId: string) {
    const profile = await this.profile(profileId).catch(() => null);
    if (!profile || profile.verification_status !== 'verified') {
      return { verified: false as const };
    }
    const selfie = (await this.documents(profileId)).find((d) => d.type === 'selfie');
    return {
      verified: true as const,
      full_name: profile.full_name,
      selfie_url: selfie ? await this.sign(selfie.file_path) : null,
      licence_expires_at: profile.licence_expires_at,
    };
  }

  // --- helpers ----------------------------------------------------------------

  async profile(profileId: string): Promise<VerificationProfile> {
    const { data } = await this.supabase.db
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', profileId)
      .maybeSingle();
    if (!data) throw new NotFoundException('Profile not found');
    return data as VerificationProfile;
  }

  private async documents(profileId: string): Promise<DocumentRow[]> {
    const { data } = await this.supabase.db
      .from('customer_documents')
      .select('id, profile_id, type, file_path, updated_at')
      .eq('profile_id', profileId);
    return (data ?? []) as DocumentRow[];
  }

  private async setStatus(profileId: string, patch: Record<string, unknown>) {
    const { error } = await this.supabase.db.from('profiles').update(patch).eq('id', profileId);
    if (error) throw new BadRequestException(dbErrorMessage(error, 'Could not update verification'));
  }

  private async sign(path: string): Promise<string | null> {
    const { data } = await this.supabase.db.storage
      .from(CUSTOMER_DOCS_BUCKET)
      .createSignedUrl(path, PREVIEW_TTL_SECONDS);
    return data?.signedUrl ?? null;
  }
}
