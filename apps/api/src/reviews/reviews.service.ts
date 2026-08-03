import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Booking, Review, ReviewTarget, UserRole } from '@karu/shared';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateReviewDto } from './dto';

/** A vendor's aggregate reputation, used on cards and profiles. */
export interface RatingSummary {
  average: number | null;
  count: number;
}

@Injectable()
export class ReviewsService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Leave a review on a completed booking. Reviews are two-sided: the
   * customer reviews the vendor, the vendor reviews the customer. Which side
   * the caller is on is derived from the booking, never from the request, and
   * the DB's UNIQUE(booking_id, target) stops a second review per side.
   */
  async create(
    bookingId: string,
    userId: string,
    role: UserRole,
    dto: CreateReviewDto,
  ): Promise<Review> {
    const { data: bookingRow, error: bookingError } = await this.supabase.db
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();
    if (bookingError || !bookingRow) throw new NotFoundException('Booking not found');
    const booking = bookingRow as Booking;

    if (booking.status !== 'completed') {
      throw new BadRequestException('You can only review a completed booking');
    }

    const target = await this.sideOf(booking, userId, role);

    const { data, error } = await this.supabase.db
      .from('reviews')
      .insert({
        booking_id: bookingId,
        author_id: userId,
        target,
        rating: dto.rating,
        comment: dto.comment ?? null,
      })
      .select('*')
      .single();

    // 23505 = UNIQUE(booking_id, target) — one review per side per booking.
    if (error) {
      if (error.code === '23505') {
        throw new ConflictException('You have already reviewed this booking');
      }
      throw new BadRequestException(error.message);
    }
    return data as Review;
  }

  /** Remove a review. Admin-only: reputation is public, so moderation is a
   * deliberate superadmin action rather than something an author can undo. */
  async remove(reviewId: string): Promise<{ deleted: true }> {
    const { error, count } = await this.supabase.db
      .from('reviews')
      .delete({ count: 'exact' })
      .eq('id', reviewId);
    if (error) throw new BadRequestException(error.message);
    if (!count) throw new NotFoundException('Review not found');
    return { deleted: true };
  }

  /** Reviews the caller has already written, so the UI can hide the form. */
  async mineForBookings(userId: string, bookingIds: string[]): Promise<Review[]> {
    if (bookingIds.length === 0) return [];
    const { data, error } = await this.supabase.db
      .from('reviews')
      .select('*')
      .eq('author_id', userId)
      .in('booking_id', bookingIds);
    if (error) throw new BadRequestException(error.message);
    return (data ?? []) as Review[];
  }

  /** Public reviews written about a vendor, newest first. */
  async listForVendor(vendorId: string, limit = 20) {
    const { data, error } = await this.supabase.db
      .from('reviews')
      .select('*, bookings!inner(vendor_id, vehicle_id, vehicles(make, model, year))')
      .eq('target', 'vendor')
      .eq('bookings.vendor_id', vendorId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  /**
   * Average rating + count per vendor, for a set of vendor ids. One query,
   * aggregated in memory — the review volume at this stage does not justify
   * a materialised view.
   */
  async summaryByVendor(vendorIds: string[]): Promise<Record<string, RatingSummary>> {
    const out: Record<string, RatingSummary> = {};
    if (vendorIds.length === 0) return out;

    const { data, error } = await this.supabase.db
      .from('reviews')
      .select('rating, bookings!inner(vendor_id)')
      .eq('target', 'vendor')
      .in('bookings.vendor_id', vendorIds);
    if (error) throw new BadRequestException(error.message);

    // PostgREST returns the joined row as an object for a to-one relation,
    // but the generated types model it as an array — accept either.
    type JoinRow = { rating: number; bookings: { vendor_id: string } | { vendor_id: string }[] };
    const totals: Record<string, { sum: number; n: number }> = {};
    for (const row of (data ?? []) as unknown as JoinRow[]) {
      const joined = Array.isArray(row.bookings) ? row.bookings[0] : row.bookings;
      if (!joined) continue;
      const id = joined.vendor_id;
      totals[id] ??= { sum: 0, n: 0 };
      totals[id].sum += row.rating;
      totals[id].n += 1;
    }
    for (const id of vendorIds) {
      const t = totals[id];
      out[id] = t
        ? { average: Math.round((t.sum / t.n) * 10) / 10, count: t.n }
        : { average: null, count: 0 };
    }
    return out;
  }

  /** Which side of the booking the caller is on — 'vendor' means they review the vendor. */
  private async sideOf(booking: Booking, userId: string, role: UserRole): Promise<ReviewTarget> {
    if (booking.customer_id === userId) return 'vendor';
    if (role === 'vendor') {
      const { data } = await this.supabase.db
        .from('vendors')
        .select('id')
        .eq('profile_id', userId)
        .maybeSingle();
      if (data && booking.vendor_id === data.id) return 'customer';
    }
    throw new ForbiddenException('You were not part of this booking');
  }
}
