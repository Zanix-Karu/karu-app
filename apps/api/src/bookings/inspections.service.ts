import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  DAMAGE_REPORT_WINDOW_HOURS,
  MAX_INSPECTION_PHOTOS,
  MIN_INSPECTION_PHOTOS,
} from '@karu/shared';
import type { Booking, BookingInspection, InspectionStage, UserRole } from '@karu/shared';
import { SupabaseService } from '../supabase/supabase.service';
import { dbErrorMessage } from '../supabase/db-error';
import { BookingsService } from './bookings.service';
import type { RecordInspectionDto } from './dto';

const INSPECTION_BUCKET = 'booking-inspections';
const PREVIEW_TTL_SECONDS = 600;
/** Mirrors the bucket's allowed_mime_types (0030); belt and braces. */
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Condition reports at handover and return (0030).
 *
 * Without them a damage dispute is one person's word against another's, and
 * the return code made it worse: read out as the keys change hands, it closed
 * the trip before anyone had walked round the car. Now the provider records
 * photos, fuel and mileage before entering either code (BookingsService
 * enforces that), and the customer can add their own report as their side of
 * the story. Both sides see both reports.
 */
@Injectable()
export class InspectionsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly bookings: BookingsService,
  ) {}

  /** Signed upload URL for one photo, namespaced to booking and author. */
  async createPhotoUpload(bookingId: string, userId: string, role: UserRole, fileName: string) {
    await this.bookings.getForUser(bookingId, userId, role);
    const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80) || 'photo';
    const path = `${bookingId}/${userId}/${randomUUID()}-${safe}`;
    const { data, error } = await this.supabase.db.storage
      .from(INSPECTION_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) {
      throw new BadRequestException(dbErrorMessage(error, 'Could not create upload URL'));
    }
    return { path: data.path, token: data.token, signedUrl: data.signedUrl };
  }

  /** Record (or replace) the caller's report for a stage. */
  async record(
    bookingId: string,
    userId: string,
    role: UserRole,
    dto: RecordInspectionDto,
  ): Promise<BookingInspection> {
    const booking = await this.bookings.getForUser(bookingId, userId, role);
    this.assertStageOpen(booking, dto.stage);

    const photos = await this.verifyOwnUploads(bookingId, userId, dto.photo_paths);
    if (photos.length < MIN_INSPECTION_PHOTOS) {
      throw new BadRequestException(
        `Add at least ${MIN_INSPECTION_PHOTOS} photos: front, back and both sides`,
      );
    }

    const { data, error } = await this.supabase.db
      .from('booking_inspections')
      .upsert(
        {
          booking_id: bookingId,
          stage: dto.stage,
          recorded_by: userId,
          recorded_role: role,
          photo_paths: photos.slice(0, MAX_INSPECTION_PHOTOS),
          fuel_eighths: dto.fuel_eighths ?? null,
          odometer_km: dto.odometer_km ?? null,
          notes: dto.notes?.trim() || null,
        },
        { onConflict: 'booking_id,stage,recorded_role' },
      )
      .select('*')
      .single();
    if (error || !data) {
      throw new BadRequestException(dbErrorMessage(error, 'Could not save the condition report'));
    }
    return data as BookingInspection;
  }

  /** Every report on the booking, with short-lived photo URLs. */
  async list(bookingId: string, userId: string, role: UserRole) {
    await this.bookings.getForUser(bookingId, userId, role);
    const { data, error } = await this.supabase.db
      .from('booking_inspections')
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true });
    if (error) throw new BadRequestException(dbErrorMessage(error, 'Could not load condition reports'));

    const rows = (data ?? []) as BookingInspection[];
    return Promise.all(
      rows.map(async (row) => ({ ...row, photo_urls: await this.sign(row.photo_paths) })),
    );
  }

  /**
   * When each stage can be recorded. Handover: once confirmed and until the
   * trip ends. Return: while the trip runs, and for the damage-report window
   * after, so a provider who spots a scratch the next morning can still say so.
   */
  private assertStageOpen(booking: Booking, stage: InspectionStage): void {
    if (stage === 'handover') {
      if (booking.status !== 'confirmed' && booking.status !== 'in_progress') {
        throw new BadRequestException('The handover report is for a confirmed booking');
      }
      return;
    }
    if (booking.status === 'in_progress') return;
    if (booking.status === 'completed' && booking.completed_at) {
      const closesAt = Date.parse(booking.completed_at) + DAMAGE_REPORT_WINDOW_HOURS * 3_600_000;
      if (Date.now() <= closesAt) return;
      throw new BadRequestException(
        `The return report closes ${DAMAGE_REPORT_WINDOW_HOURS} hours after the car comes back`,
      );
    }
    throw new BadRequestException('The return report is for a trip in progress');
  }

  /** Same check as FeedbackService: only this author's uploads, of an image type. */
  private async verifyOwnUploads(bookingId: string, userId: string, paths: string[]): Promise<string[]> {
    const folder = `${bookingId}/${userId}`;
    const owned = [...new Set(paths)].filter((p) => p.startsWith(`${folder}/`));
    if (!owned.length) return [];

    const { data: objects } = await this.supabase.db.storage
      .from(INSPECTION_BUCKET)
      .list(folder, { limit: 100 });
    const byName = new Map((objects ?? []).map((o) => [`${folder}/${o.name}`, o]));
    return owned.filter((path) => {
      const mimetype = byName.get(path)?.metadata?.mimetype;
      return !!mimetype && ALLOWED_IMAGE_MIME_TYPES.has(mimetype);
    });
  }

  private async sign(paths: string[]): Promise<string[]> {
    if (!paths.length) return [];
    const { data } = await this.supabase.db.storage
      .from(INSPECTION_BUCKET)
      .createSignedUrls(paths, PREVIEW_TTL_SECONDS);
    return (data ?? []).map((d) => d.signedUrl).filter((u): u is string => Boolean(u));
  }
}
