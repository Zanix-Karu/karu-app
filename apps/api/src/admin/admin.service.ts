import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  canTransitionVendor,
  type Booking,
  type Vendor,
  type VendorDocument,
  type Vehicle,
  type VendorStatus,
} from '@karu/shared';
import { createHash } from 'node:crypto';
import { SupabaseService } from '../supabase/supabase.service';
import { NotificationsService } from '../notifications/notifications.service';
import { dbErrorMessage } from '../supabase/db-error';
import {
  AdminCreateVehicleDto,
  AdminCreateVendorDto,
  CreateVehicleBlockDto,
  ReviewDocumentDto,
  SetVendorStatusDto,
} from './dto';

const DOCUMENTS_BUCKET = 'vendor-documents';

/**
 * REQ-12: insurance, carte grise and roadworthiness lapse quietly. Shared by
 * the dashboard's aggregate counters and each document's per-row flag so the
 * two can never disagree about what "expiring soon" means.
 */
const DOC_EXPIRY_WARNING_DAYS = 30;

/** Below this, a scan is likely blank/corrupt rather than a real document. */
const TINY_DOCUMENT_BYTES = 20 * 1024;

/** One document row as the admin Documents tab renders it. */
export interface AdminDocumentRow extends VendorDocument {
  vendors: { business_name: string } | null;
  vehicles: { make: string; model: string; registration_number: string | null } | null;
  /** Advisory only — the reviewer still decides. Never auto-rejects. */
  flags: string[];
}

@Injectable()
export class AdminService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Ops dashboard counters: what needs attention right now. */
  async overview() {
    const count = async (table: string, filters: Record<string, string> = {}) => {
      let q = this.supabase.db.from(table).select('*', { count: 'exact', head: true });
      for (const [col, val] of Object.entries(filters)) q = q.eq(col, val);
      const { count: n, error } = await q;
      if (error) throw new BadRequestException(dbErrorMessage(error, 'Could not load overview counters'));
      return n ?? 0;
    };

    // FEAT-6: the console showed totals but nothing that decays. A request
    // sitting unanswered and a document waiting on review are the two things
    // where the cost is measured in the customer's patience, so they get their
    // own counters rather than being buried inside "requested bookings".
    const REPLY_WINDOW_HOURS = 24;
    const WARN_AFTER_HOURS = 20;
    const staleBefore = new Date(
      Date.now() - WARN_AFTER_HOURS * 60 * 60 * 1000,
    ).toISOString();

    const staleRequestCount = async () => {
      const { count: n, error } = await this.supabase.db
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'requested')
        .lt('created_at', staleBefore);
      if (error) throw new BadRequestException(dbErrorMessage(error, 'Could not load overview counters'));
      return n ?? 0;
    };

    // Someone on a booking has asked Karu to step in and no admin has closed
    // it yet. This one outranks the counters: a person is waiting on a human.
    const openAssistanceCount = async () => {
      const { count: n, error } = await this.supabase.db
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .not('assistance_requested_at', 'is', null)
        .is('assistance_resolved_at', null);
      if (error) throw new BadRequestException(dbErrorMessage(error, 'Could not load overview counters'));
      return n ?? 0;
    };

    /**
     * REQ-12: insurance, carte grise and roadworthiness lapse quietly —
     * nothing today re-checks `expires_at` after a document is approved, so a
     * car keeps renting on paperwork nobody has looked at in months. A
     * rejected document isn't the operative one (a replacement is expected),
     * so only pending/approved rows count.
     */
    const now = new Date();
    const warnBefore = new Date(now.getTime() + DOC_EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const nowIso = now.toISOString();

    const expiredDocumentCount = async () => {
      const { count: n, error } = await this.supabase.db
        .from('vendor_documents')
        .select('*', { count: 'exact', head: true })
        .neq('status', 'rejected')
        .not('expires_at', 'is', null)
        .lt('expires_at', nowIso);
      if (error) throw new BadRequestException(error.message);
      return n ?? 0;
    };

    const documentsExpiringSoonCount = async () => {
      const { count: n, error } = await this.supabase.db
        .from('vendor_documents')
        .select('*', { count: 'exact', head: true })
        .neq('status', 'rejected')
        .gte('expires_at', nowIso)
        .lte('expires_at', warnBefore);
      if (error) throw new BadRequestException(error.message);
      return n ?? 0;
    };

    /**
     * 0030: the cheating signals. A provider who keeps cancelling customers
     * they already accepted, and chats where someone talked about moving the
     * deal off Karu. Both are "look at this", not verdicts.
     */
    const RELIABILITY_WINDOW_DAYS = 90;
    const UNRELIABLE_AFTER_CANCELLATIONS = 2;
    const reliabilitySince = new Date(
      now.getTime() - RELIABILITY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    const unreliableVendors = async () => {
      const { data, error } = await this.supabase.db
        .from('bookings')
        .select('vendor_id')
        .eq('cancelled_by', 'vendor')
        .gte('cancelled_at', reliabilitySince);
      if (error) throw new BadRequestException(dbErrorMessage(error, 'Could not load overview counters'));
      const perVendor = new Map<string, number>();
      for (const row of (data ?? []) as Array<{ vendor_id: string }>) {
        perVendor.set(row.vendor_id, (perVendor.get(row.vendor_id) ?? 0) + 1);
      }
      const ids = [...perVendor].filter(([, n]) => n >= UNRELIABLE_AFTER_CANCELLATIONS).map(([id]) => id);
      if (!ids.length) return [];
      const { data: vendors } = await this.supabase.db
        .from('vendors')
        .select('id, business_name')
        .in('id', ids);
      return ((vendors ?? []) as Array<{ id: string; business_name: string }>)
        .map((v) => ({ id: v.id, business_name: v.business_name, cancellations: perVendor.get(v.id) ?? 0 }))
        .sort((a, b) => b.cancellations - a.cancellations);
    };

    const flaggedConversationCount = async () => {
      const { data, error } = await this.supabase.db
        .from('booking_messages')
        .select('booking_id')
        .neq('flags', '{}')
        .gte('created_at', reliabilitySince);
      if (error) throw new BadRequestException(dbErrorMessage(error, 'Could not load overview counters'));
      return new Set(((data ?? []) as Array<{ booking_id: string }>).map((r) => r.booking_id)).size;
    };

    const [
      pendingVendors,
      requestedBookings,
      activeVehicles,
      customers,
      pendingDocuments,
      staleRequests,
      openAssistance,
      expiredDocuments,
      documentsExpiringSoon,
    ] = await Promise.all([
      count('vendors', { status: 'pending' }),
      count('bookings', { status: 'requested' }),
      count('vehicles', { status: 'active' }),
      count('profiles', { role: 'customer' }),
      count('vendor_documents', { status: 'pending' }),
      staleRequestCount(),
      openAssistanceCount(),
      expiredDocumentCount(),
      documentsExpiringSoonCount(),
    ]);
    const [vendorsCancelling, flaggedConversations, pendingVerifications] = await Promise.all([
      unreliableVendors(),
      flaggedConversationCount(),
      // 0032: customers waiting on an ID check can't have self-drive accepted.
      count('profiles', { verification_status: 'pending' }),
    ]);
    return {
      pendingVendors,
      requestedBookings,
      activeVehicles,
      customers,
      pendingDocuments,
      /** Requested bookings within 4h of the 24h reply window closing. */
      staleRequests,
      /** Bookings where a party asked for Karu and no admin has closed it. */
      openAssistance,
      replyWindowHours: REPLY_WINDOW_HOURS,
      /** Approved/pending vendor documents whose expires_at has passed. */
      expiredDocuments,
      /** ...expiring within docExpiryWarningDays, not yet expired. */
      documentsExpiringSoon,
      docExpiryWarningDays: DOC_EXPIRY_WARNING_DAYS,
      /** Providers with UNRELIABLE_AFTER_CANCELLATIONS+ cancellations in the window. */
      vendorsCancelling,
      /** Conversations with an off-platform flag in the window. */
      flaggedConversations,
      reliabilityWindowDays: RELIABILITY_WINDOW_DAYS,
      /** Customer ID checks waiting on an admin (0032). */
      pendingVerifications,
    };
  }

  // --- vendor verification ---------------------------------------------------

  async listVendors(status?: VendorStatus): Promise<Vendor[]> {
    let q = this.supabase.db.from('vendors').select('*');
    if (status) q = q.eq('status', status);
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw new BadRequestException(dbErrorMessage(error, 'Could not list vendors'));
    return (data ?? []) as Vendor[];
  }

  /** Verify / reject / suspend a vendor. verified_at is stamped exactly once. */
  async setVendorStatus(vendorId: string, dto: SetVendorStatusDto): Promise<Vendor> {
    const { data: current } = await this.supabase.db
      .from('vendors')
      .select('*')
      .eq('id', vendorId)
      .maybeSingle();
    if (!current) throw new NotFoundException('Vendor not found');

    const from = (current as Vendor).status;
    if (from === dto.status) return current as Vendor;
    if (!canTransitionVendor(from, dto.status)) {
      throw new ConflictException(`A ${from} vendor cannot be moved to ${dto.status}`);
    }
    // REQ-9: a suspension with no recorded reason leaves the vendor guessing
    // and leaves a later admin with no record of what triggered it.
    if (dto.status === 'suspended' && !dto.reason?.trim()) {
      throw new BadRequestException('A reason is required when suspending a vendor');
    }

    const patch: Record<string, unknown> = { status: dto.status };
    if (dto.status === 'verified') patch.verified_at = new Date().toISOString();
    if (dto.status === 'suspended') patch.suspension_reason = dto.reason!.trim();
    // Reinstating clears the old reason — it described a problem that's now
    // resolved, so it shouldn't linger as if still in force.
    if (from === 'suspended' && dto.status === 'verified') patch.suspension_reason = null;

    const { data, error } = await this.supabase.db
      .from('vendors')
      .update(patch)
      .eq('id', vendorId)
      .select('*')
      .single();
    if (error || !data) throw new NotFoundException('Vendor not found');

    // A vendor who has just been suspended or rejected cannot honour open
    // requests — decline them now rather than leaving customers waiting on an
    // answer that can never come. Confirmed bookings are left for the ops
    // team to resolve case by case (cancel + refund vs honour).
    if (dto.status === 'suspended' || dto.status === 'rejected') {
      await this.supabase.db
        .from('bookings')
        .update({ status: 'rejected' })
        .eq('vendor_id', vendorId)
        .eq('status', 'requested');
    }

    // REQ-9: tell the vendor either way, and — only for a fresh suspension —
    // tell any customer holding a standing booking that their provider is
    // under review. This is a transparency notice, not a cancellation: ops
    // still makes the cancel-vs-honour call case by case, per the comment
    // above. Best-effort: notifications never block or fail this response.
    if (dto.status === 'suspended') {
      await this.notifications.notifyVendorSuspended(data as Vendor, dto.reason!.trim());
      const { data: standing } = await this.supabase.db
        .from('bookings')
        .select('*')
        .eq('vendor_id', vendorId)
        .in('status', ['confirmed', 'in_progress']);
      for (const booking of (standing ?? []) as Booking[]) {
        await this.notifications.notifyCustomerVendorUnderReview(booking);
      }
    } else if (from === 'suspended' && dto.status === 'verified') {
      await this.notifications.notifyVendorReinstated(data as Vendor);
    }
    return data as Vendor;
  }

  /** Documents awaiting (or past) review, with their vendor's name and, when
   *  scoped to a car, the car — reviewers match plates against cartes grises.
   *  Each row also carries automated red-flags (see `attachDocumentFlags`) —
   *  advisory only, the reviewer still approves or rejects by hand. */
  async listDocuments(
    status?: 'pending' | 'approved' | 'rejected',
    vendorId?: string,
  ): Promise<AdminDocumentRow[]> {
    let q = this.supabase.db
      .from('vendor_documents')
      .select('*, vendors(business_name), vehicles(make, model, registration_number)');
    if (status) q = q.eq('status', status);
    if (vendorId) q = q.eq('vendor_id', vendorId);
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw new BadRequestException(dbErrorMessage(error, 'Could not list documents'));
    return this.attachDocumentFlags((data ?? []) as Omit<AdminDocumentRow, 'flags'>[]);
  }

  /**
   * Automated pre-checks surfaced to the admin reviewer before they decide —
   * no external ID/OCR verification, no auto-reject. Three signals, each
   * cheap and local:
   *  - expired / expiring_soon: the same predicate the dashboard's aggregate
   *    counters already use (see `overview()`), just evaluated per row.
   *  - tiny_file: the stored object's size via `.list()` metadata — no
   *    download, since documents can be up to 15 MiB and this runs on every
   *    list-view render.
   *  - duplicate_of_own: this document's content hash matches another
   *    document already on file for the *same* vendor — catches one scan
   *    reused across two different requirement types. Deliberately scoped to
   *    one vendor's own (small, bounded) document set: hashing every
   *    document across every vendor on every list call would be a real
   *    cost/perf problem, not an oversight.
   */
  private async attachDocumentFlags(
    rows: Omit<AdminDocumentRow, 'flags'>[],
  ): Promise<AdminDocumentRow[]> {
    const nowMs = Date.now();
    const warnBeforeMs = nowMs + DOC_EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000;

    const vendorIds = [...new Set(rows.map((r) => r.vendor_id))];
    const siblingsByVendor = new Map<string, Array<{ id: string; file_path: string }>>();
    await Promise.all(
      vendorIds.map(async (vendorId) => {
        const { data } = await this.supabase.db
          .from('vendor_documents')
          .select('id, file_path')
          .eq('vendor_id', vendorId);
        siblingsByVendor.set(vendorId, (data ?? []) as Array<{ id: string; file_path: string }>);
      }),
    );

    // Hashes are re-used across rows in the same call so one file is never
    // downloaded/hashed twice just because two of its siblings are compared.
    const hashCache = new Map<string, string | null>();
    const hashOf = async (filePath: string): Promise<string | null> => {
      if (hashCache.has(filePath)) return hashCache.get(filePath) ?? null;
      const { data: blob, error } = await this.supabase.db.storage
        .from(DOCUMENTS_BUCKET)
        .download(filePath);
      const hash = !error && blob ? createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex') : null;
      hashCache.set(filePath, hash);
      return hash;
    };

    return Promise.all(
      rows.map(async (row) => {
        const flags: string[] = [];

        if (row.expires_at && row.status !== 'rejected') {
          const expiresMs = new Date(row.expires_at).getTime();
          if (expiresMs < nowMs) flags.push('expired');
          else if (expiresMs <= warnBeforeMs) flags.push('expiring_soon');
        }

        const slashAt = row.file_path.indexOf('/');
        if (slashAt !== -1) {
          const folder = row.file_path.slice(0, slashAt);
          const name = row.file_path.slice(slashAt + 1);
          const { data: listed } = await this.supabase.db.storage
            .from(DOCUMENTS_BUCKET)
            .list(folder, { search: name, limit: 1 });
          const size = listed?.find((o) => o.name === name)?.metadata?.size;
          if (typeof size === 'number' && size < TINY_DOCUMENT_BYTES) flags.push('tiny_file');
        }

        const siblings = (siblingsByVendor.get(row.vendor_id) ?? []).filter((d) => d.id !== row.id);
        if (siblings.length) {
          const myHash = await hashOf(row.file_path);
          if (myHash) {
            for (const sibling of siblings) {
              if ((await hashOf(sibling.file_path)) === myHash) {
                flags.push('duplicate_of_own');
                break;
              }
            }
          }
        }

        return { ...row, flags } as AdminDocumentRow;
      }),
    );
  }

  /**
   * REQ-4: "add send-failure logging/retry so bounces are visible, not
   * swallowed" — every send already lands in email_log (migration 0012),
   * but nothing surfaced it. This is that surface: the 100 most recent
   * attempts, optionally narrowed to failures, with the booking's reference
   * joined in so a failure reads as "KARU-20260801-0012 to jean@..." rather
   * than a bare UUID.
   */
  async listEmailLog(status?: 'sent' | 'failed') {
    let q = this.supabase.db.from('email_log').select('*, bookings(reference)');
    if (status) q = q.eq('status', status);
    const { data, error } = await q.order('created_at', { ascending: false }).limit(100);
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
      throw new BadRequestException(dbErrorMessage(signError, 'Could not create download link'));
    }
    return { url: data.signedUrl, expiresIn };
  }

  async reviewDocument(documentId: string, reviewerId: string, dto: ReviewDocumentDto) {
    const patch: Record<string, unknown> = {
      status: dto.status,
      notes: dto.notes ?? null,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    };
    // The reviewer is looking at the actual certificate — their reading of the
    // expiry date beats whatever the vendor typed at upload.
    if (dto.expires_at !== undefined) patch.expires_at = dto.expires_at;

    const { data, error } = await this.supabase.db
      .from('vendor_documents')
      .update(patch)
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
      throw new ConflictException(dbErrorMessage(authError, 'Could not create vendor user'));
    }

    const { data, error } = await this.supabase.db
      .from('vendors')
      .insert({
        profile_id: created.user.id,
        business_name: dto.business_name,
        city: dto.city,
        rccm_number: dto.rccm_number ?? null,
        contact_person: dto.full_name ?? null,
        contact_phone: dto.contact_phone ?? null,
        whatsapp_number: dto.whatsapp_number ?? null,
        address: dto.address ?? null,
        contact_email: dto.contact_email,
        status: 'verified',
        verified_at: new Date().toISOString(),
      })
      .select('*')
      .single();
    if (error || !data) throw new ConflictException(dbErrorMessage(error, 'Could not create vendor'));
    return data as Vendor;
  }

  /**
   * Team-added car for a vendor. Starts as a draft like every other listing —
   * a brand-new row can't have its six required photos yet (spec §5), so
   * publishing happens afterwards via PATCH, where the photo gate applies to
   * admins and vendors alike.
   */
  async createVehicleOnBehalf(dto: AdminCreateVehicleDto): Promise<Vehicle> {
    const { vendor_id, status, ...rest } = dto;
    if (status === 'active') {
      throw new BadRequestException(
        'A new listing needs its six required photos before going live — create it, add the photos, then publish',
      );
    }

    const vendor = await this.supabase.db
      .from('vendors')
      .select('id')
      .eq('id', vendor_id)
      .maybeSingle();
    if (!vendor.data) throw new NotFoundException('Vendor not found');

    const { data, error } = await this.supabase.db
      .from('vehicles')
      .insert({ ...rest, vendor_id, status: status ?? 'draft' })
      .select('*')
      .single();
    if (error || !data) throw new BadRequestException(dbErrorMessage(error, 'Could not create vehicle'));
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
      throw new BadRequestException(dbErrorMessage(error, 'Could not create block'));
    }
    return data;
  }

  async deleteBlock(blockId: string) {
    const { error, count } = await this.supabase.db
      .from('vehicle_blocks')
      .delete({ count: 'exact' })
      .eq('id', blockId);
    if (error) throw new BadRequestException(dbErrorMessage(error, 'Could not delete block'));
    if (!count) throw new NotFoundException('Block not found');
    return { deleted: true };
  }

  // --- bookings oversight ----------------------------------------------------

  async listBookings(status?: Booking['status']): Promise<Booking[]> {
    let q = this.supabase.db.from('bookings').select('*');
    if (status) q = q.eq('status', status);
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw new BadRequestException(dbErrorMessage(error, 'Could not list bookings'));
    return (data ?? []) as Booking[];
  }
}
