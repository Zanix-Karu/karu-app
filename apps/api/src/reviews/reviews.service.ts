import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Booking, Review, ReviewTarget, UserRole } from '@karu/shared';
import { SupabaseService } from '../supabase/supabase.service';
import { ConfigService } from '@nestjs/config';
import { CreateReviewDto } from './dto';
import {
  DeepLProvider,
  NullTranslationProvider,
  guessLanguage,
  type TranslationProvider,
} from './translation';

/** A vendor's aggregate reputation, used on cards and profiles. */
export interface RatingSummary {
  average: number | null;
  count: number;
}

@Injectable()
export class ReviewsService {
  /** Chosen at boot: a key makes translation real, no key hides the feature. */
  private readonly translator: TranslationProvider;

  constructor(
    private readonly supabase: SupabaseService,
    config: ConfigService,
  ) {
    const key = config.get<string>('DEEPL_API_KEY');
    this.translator = key ? new DeepLProvider({ apiKey: key }) : new NullTranslationProvider();
  }

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
        // The author's own interface language, not a guess at the text. It is
        // the one signal we can take at face value, and it lets a reader be
        // told what they are looking at rather than being handed French under
        // an English lang attribute.
        language: await this.authorLanguage(userId),
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

  /** The locale the author has the app set to. Null rather than a guess. */
  private async authorLanguage(userId: string): Promise<'en' | 'fr' | null> {
    const { data } = await this.supabase.db
      .from('profiles')
      .select('locale')
      .eq('id', userId)
      .maybeSingle();
    const locale = (data as { locale?: string } | null)?.locale;
    return locale === 'fr' || locale === 'en' ? locale : null;
  }

  /** Is a translation engine wired up? Screens use this to hide the control. */
  get canTranslate(): boolean {
    return this.translator.canTranslate;
  }

  /**
   * Translate one review into the reader's language, caching the result.
   *
   * The original is never overwritten and never replaced in place: the reader
   * asks, sees the translation labelled as one, and can go back. That is both
   * honest about machine output and what people already expect from every
   * other marketplace.
   */
  async translation(reviewId: string, targetLang: 'en' | 'fr') {
    if (!this.translator.canTranslate) {
      throw new BadRequestException('Translation is not available');
    }

    const { data: cached } = await this.supabase.db
      .from('review_translations')
      .select('body')
      .eq('review_id', reviewId)
      .eq('target_lang', targetLang)
      .maybeSingle();
    if (cached) return { body: (cached as { body: string }).body, cached: true };

    const { data: reviewRow } = await this.supabase.db
      .from('reviews')
      .select('id, comment, language')
      .eq('id', reviewId)
      .maybeSingle();
    const review = reviewRow as { comment: string | null; language: string | null } | null;
    if (!review?.comment) throw new NotFoundException('Nothing to translate');

    const source = review.language ?? guessLanguage(review.comment);
    if (source === targetLang) {
      // Asking to translate into the language it is already in is not an
      // error, it just has nothing to do.
      return { body: review.comment, cached: false };
    }

    const body = await this.translator.translate(review.comment, targetLang);

    // Best-effort cache. A failure here costs a re-translation, not the reply.
    await this.supabase.db
      .from('review_translations')
      .insert({ review_id: reviewId, target_lang: targetLang, body, provider: this.translator.name });

    return { body, cached: false };
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
      // SECURITY: explicit columns on a @Public() route. '*' shipped author_id,
      // an internal profile UUID that lets anyone correlate reviews back to a
      // specific account. Same shape as the vendor and vehicle projections.
      .select(
        'id, booking_id, target, rating, comment, language, created_at, bookings!inner(vendor_id, vehicle_id, vehicles(make, model, year))',
      )
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
