import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { UserRole } from '@karu/shared';
import { SupabaseService } from '../supabase/supabase.service';
import { dbErrorMessage } from '../supabase/db-error';
import { CreateFeedbackDto, FEEDBACK_STATUSES, UpdateFeedbackDto } from './dto';

const FEEDBACK_BUCKET = 'feedback-images';
const MAX_IMAGES = 5;
const PREVIEW_TTL_SECONDS = 600; // 10 min — long enough to open in the admin queue
/** Mirrors the bucket's own allowed_mime_types (0026); belt and braces. */
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

@Injectable()
export class FeedbackService {
  constructor(private readonly supabase: SupabaseService) {}

  /** A customer or vendor submits a report. Screenshots (if any) are uploaded
   *  first via createImageUpload and their paths passed here. */
  async create(userId: string, role: UserRole, dto: CreateFeedbackDto) {
    const images = await this.verifyOwnUploads(userId, (dto.image_paths ?? []).slice(0, MAX_IMAGES));
    const { data, error } = await this.supabase.db
      .from('feedback')
      .insert({
        author_id: userId,
        author_role: role,
        category: dto.category,
        message: dto.message,
        page: dto.page ?? null,
        app_version: dto.app_version ?? null,
        image_paths: images,
      })
      .select('*')
      .single();
    if (error || !data) {
      throw new BadRequestException(dbErrorMessage(error, 'Could not submit feedback'));
    }
    return data;
  }

  /** Signed upload URL for one screenshot, namespaced to the author so one
   *  user can never overwrite another's file. */
  async createImageUpload(userId: string, fileName: string) {
    const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80) || 'image';
    const path = `${userId}/${randomUUID()}-${safe}`;
    const { data, error } = await this.supabase.db.storage
      .from(FEEDBACK_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) {
      throw new BadRequestException(dbErrorMessage(error, 'Could not create upload URL'));
    }
    return { path: data.path, token: data.token, signedUrl: data.signedUrl };
  }

  /**
   * Confirms each submitted path actually belongs to this author and was
   * actually uploaded (with an allowed image type) before trusting it on the
   * report — mirrors VehiclesService.attachPhoto. Silently drops any path
   * that fails a check rather than rejecting the whole report over one bad
   * screenshot.
   */
  private async verifyOwnUploads(userId: string, paths: string[]): Promise<string[]> {
    const prefix = `${userId}/`;
    const owned = paths.filter((p) => p.startsWith(prefix));
    if (!owned.length) return [];

    const { data: objects } = await this.supabase.db.storage
      .from(FEEDBACK_BUCKET)
      .list(userId, { limit: owned.length * 2 });
    const byName = new Map((objects ?? []).map((o) => [`${prefix}${o.name}`, o]));

    return owned.filter((path) => {
      const object = byName.get(path);
      const mimetype = object?.metadata?.mimetype;
      return !!mimetype && ALLOWED_IMAGE_MIME_TYPES.has(mimetype);
    });
  }

  /** The author's own reports, newest first. */
  async listMine(userId: string) {
    const { data, error } = await this.supabase.db
      .from('feedback')
      .select('*')
      .eq('author_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw new BadRequestException(dbErrorMessage(error, 'Could not load feedback'));
    return data ?? [];
  }

  // --- admin queue ---------------------------------------------------------

  /** Every report for the admin console, with the author's display name and
   *  short-lived signed URLs for any screenshots. */
  async listAll(status?: string) {
    let query = this.supabase.db
      .from('feedback')
      .select('*, author:profiles!feedback_author_id_fkey(full_name)')
      .order('created_at', { ascending: false });
    if (status && (FEEDBACK_STATUSES as readonly string[]).includes(status)) {
      query = query.eq('status', status);
    }
    const { data, error } = await query;
    if (error) throw new BadRequestException(dbErrorMessage(error, 'Could not load feedback'));

    const rows = (data ?? []) as Array<Record<string, unknown> & { image_paths?: string[] }>;
    return Promise.all(
      rows.map(async (row) => ({
        ...row,
        image_urls: await this.signImages(row.image_paths ?? []),
      })),
    );
  }

  private async signImages(paths: string[]): Promise<string[]> {
    if (!paths.length) return [];
    const { data } = await this.supabase.db.storage
      .from(FEEDBACK_BUCKET)
      .createSignedUrls(paths, PREVIEW_TTL_SECONDS);
    return (data ?? []).map((d) => d.signedUrl).filter((u): u is string => Boolean(u));
  }

  async updateStatus(id: string, adminId: string, dto: UpdateFeedbackDto) {
    const patch: Record<string, unknown> = {};
    if (dto.status !== undefined) {
      patch.status = dto.status;
      patch.resolved_by = dto.status === 'resolved' ? adminId : null;
      patch.resolved_at = dto.status === 'resolved' ? new Date().toISOString() : null;
    }
    if (dto.admin_note !== undefined) patch.admin_note = dto.admin_note;
    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('Nothing to update');
    }
    const { data, error } = await this.supabase.db
      .from('feedback')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (error || !data) throw new NotFoundException(dbErrorMessage(error, 'Feedback not found'));
    return data;
  }
}
