import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { haversineKm } from '@karu/shared';
import type { Booking, UserRole } from '@karu/shared';
import { SupabaseService } from '../supabase/supabase.service';
import { dbErrorMessage } from '../supabase/db-error';
import { BookingsService } from './bookings.service';

/** Where an airport meet ends up, by the car's city. */
const AIRPORTS: Record<string, { lat: number; lng: number }> = {
  douala: { lat: 4.0061, lng: 9.7195 },
  yaounde: { lat: 3.7226, lng: 11.5533 },
};

/**
 * A rough city ETA: straight-line distance stretched for real roads, over a
 * Douala-traffic average. Shown as "about N min", never as a promise.
 */
const ROAD_FACTOR = 1.35;
const CITY_KMH = 22;
/** A position older than this is shown as "last seen", not live. */
const STALE_AFTER_MS = 2 * 60_000;

/**
 * Live tracking of the delivery leg (0035). The provider's phone (or their
 * driver's) posts its position while they bring the car; the customer polls.
 * Only the latest point is kept, and it's wiped when tracking stops or the
 * car is handed over.
 */
@Injectable()
export class TrackingService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly bookings: BookingsService,
  ) {}

  /** The provider sets off. Only for a confirmed booking where they bring the car. */
  async start(bookingId: string, userId: string, role: UserRole) {
    const booking = await this.ownedByProvider(bookingId, userId, role);
    if (booking.status !== 'confirmed') {
      throw new BadRequestException('Tracking is for a confirmed booking on its way to the customer');
    }
    if (booking.delivery_type === 'pickup_point' && !booking.with_driver) {
      throw new BadRequestException('The customer is collecting this car, so there is nothing to track');
    }
    await this.patch(bookingId, {
      tracking_started_at: new Date().toISOString(),
      tracking_ended_at: null,
      tracking_lat: null,
      tracking_lng: null,
      tracking_updated_at: null,
    });
    return this.state(bookingId, userId, role);
  }

  async update(bookingId: string, userId: string, role: UserRole, point: { lat: number; lng: number }) {
    const booking = await this.ownedByProvider(bookingId, userId, role);
    if (!booking.tracking_started_at || booking.tracking_ended_at || booking.status !== 'confirmed') {
      throw new BadRequestException('Tracking is not running for this booking');
    }
    await this.patch(bookingId, {
      tracking_lat: point.lat,
      tracking_lng: point.lng,
      tracking_updated_at: new Date().toISOString(),
    });
    return { ok: true };
  }

  async stop(bookingId: string, userId: string, role: UserRole) {
    await this.ownedByProvider(bookingId, userId, role);
    await this.patch(bookingId, TrackingService.cleared());
    return { ok: true };
  }

  /** What either party (or an admin) sees: where the car is and roughly when it arrives. */
  async state(bookingId: string, userId: string, role: UserRole) {
    const booking = (await this.bookings.getForUser(bookingId, userId, role)) as Booking & TrackingColumns;
    const active = Boolean(booking.tracking_started_at && !booking.tracking_ended_at && booking.status === 'confirmed');
    if (!active) return { active: false as const };

    const destination = await this.destination(booking);
    const position =
      booking.tracking_lat != null && booking.tracking_lng != null
        ? { lat: booking.tracking_lat, lng: booking.tracking_lng }
        : null;
    const distanceKm = position && destination ? haversineKm(position, destination) : null;
    return {
      active: true as const,
      started_at: booking.tracking_started_at,
      position,
      updated_at: booking.tracking_updated_at,
      stale: booking.tracking_updated_at
        ? Date.now() - Date.parse(booking.tracking_updated_at) > STALE_AFTER_MS
        : true,
      destination,
      distance_km: distanceKm === null ? null : Math.round(distanceKm * 10) / 10,
      eta_minutes:
        distanceKm === null ? null : Math.max(1, Math.round(((distanceKm * ROAD_FACTOR) / CITY_KMH) * 60)),
    };
  }

  /** Fields that end tracking; also applied by BookingsService on handover. */
  static cleared() {
    return {
      tracking_ended_at: new Date().toISOString(),
      tracking_lat: null,
      tracking_lng: null,
      tracking_updated_at: null,
    };
  }

  private async destination(booking: Booking): Promise<{ lat: number; lng: number } | null> {
    if (booking.delivery_type === 'address' && booking.delivery_lat != null && booking.delivery_lng != null) {
      return { lat: booking.delivery_lat, lng: booking.delivery_lng };
    }
    if (booking.delivery_type === 'airport') {
      const { data } = await this.supabase.db.from('vehicles').select('city').eq('id', booking.vehicle_id).maybeSingle();
      return AIRPORTS[(data as { city?: string } | null)?.city ?? ''] ?? null;
    }
    return null;
  }

  private async ownedByProvider(bookingId: string, userId: string, role: UserRole) {
    if (role !== 'vendor' && role !== 'admin') {
      throw new ForbiddenException('Only the provider shares the car\'s location');
    }
    return (await this.bookings.getForUser(bookingId, userId, role)) as Booking & TrackingColumns;
  }

  private async patch(bookingId: string, patch: Record<string, unknown>) {
    const { error } = await this.supabase.db.from('bookings').update(patch).eq('id', bookingId);
    if (error) throw new BadRequestException(dbErrorMessage(error, 'Could not update tracking'));
  }
}

interface TrackingColumns {
  tracking_started_at: string | null;
  tracking_lat: number | null;
  tracking_lng: number | null;
  tracking_updated_at: string | null;
  tracking_ended_at: string | null;
}
