import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { canTransitionBooking, computeDepositXaf } from '@karu/shared';
import type { Booking, BookingStatus, UserRole } from '@karu/shared';
import { SupabaseService } from '../supabase/supabase.service';
import { VehiclesService } from '../vehicles/vehicles.service';
import { assertValidWindow } from '../vehicles/dates';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateBookingDto } from './dto';

/** Status changes each role is permitted to drive (on top of the state machine). */
const ALLOWED_BY_ROLE: Record<UserRole, BookingStatus[]> = {
  customer: ['cancelled'],
  vendor: ['confirmed', 'rejected', 'in_progress', 'completed', 'cancelled'],
  admin: ['confirmed', 'rejected', 'cancelled', 'in_progress', 'completed'],
};

@Injectable()
export class BookingsService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly vehicles: VehiclesService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * A customer requests a vehicle. Price and deposit are computed server-side
   * from the vehicle's current rate (snapshotted so later edits never change
   * an existing booking), availability is pre-checked, and a human-readable
   * reference is minted. Both parties are emailed (best-effort).
   */
  async create(customerId: string, dto: CreateBookingDto): Promise<Booking> {
    assertValidWindow(dto.start_date, dto.end_date);
    const today = new Date().toISOString().slice(0, 10);
    if (dto.start_date < today) {
      throw new BadRequestException('start_date cannot be in the past');
    }

    const vehicle = await this.vehicles.getById(dto.vehicle_id);
    if (vehicle.status !== 'active') {
      throw new BadRequestException('Vehicle is not available for booking');
    }

    // Pre-check availability for a friendly 409. The DB exclusion constraint
    // remains the race-proof backstop at confirmation time.
    const { available } = await this.vehicles.availability(
      dto.vehicle_id,
      dto.start_date,
      dto.end_date,
    );
    if (!available) {
      throw new ConflictException('Vehicle is already booked or blocked for those dates');
    }

    const days = this.rentalDays(dto.start_date, dto.end_date);
    const total = vehicle.daily_rate_xaf * days;

    const { data: reference, error: refError } = await this.supabase.db.rpc(
      'next_booking_reference',
    );
    if (refError || !reference) {
      throw new BadRequestException(refError?.message ?? 'Could not allocate reference');
    }

    const { data, error } = await this.supabase.db
      .from('bookings')
      .insert({
        vehicle_id: vehicle.id,
        customer_id: customerId,
        vendor_id: vehicle.vendor_id,
        start_date: dto.start_date,
        end_date: dto.end_date,
        pickup_location: dto.pickup_location ?? null,
        customer_note: dto.customer_note ?? null,
        daily_rate_xaf: vehicle.daily_rate_xaf,
        total_xaf: total,
        deposit_xaf: computeDepositXaf(total),
        reference,
        status: 'requested',
      })
      .select('*')
      .single();
    if (error || !data) throw new BadRequestException(error?.message ?? 'Could not create booking');

    const booking = data as Booking;
    await this.notifications.notifyBookingEvent(booking, 'requested');
    return booking;
  }

  /** Bookings visible to the caller: as the customer, or as the vendor's vehicles. */
  async listForUser(userId: string, role: UserRole): Promise<Booking[]> {
    let q = this.supabase.db.from('bookings').select('*');
    if (role === 'vendor') {
      const vendor = await this.supabase.db
        .from('vendors')
        .select('id')
        .eq('profile_id', userId)
        .maybeSingle();
      if (!vendor.data) return [];
      q = q.eq('vendor_id', vendor.data.id);
    } else if (role === 'customer') {
      q = q.eq('customer_id', userId);
    }
    // admin: no filter — sees all
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw new NotFoundException(error.message);
    return (data ?? []) as Booking[];
  }

  /**
   * Drive a booking to a new status. Enforces both the state machine
   * (canTransitionBooking) and per-role permissions, plus ownership.
   */
  async transition(
    bookingId: string,
    userId: string,
    role: UserRole,
    next: BookingStatus,
    vendorNote?: string,
  ): Promise<Booking> {
    const booking = await this.getOwned(bookingId, userId, role);

    if (!canTransitionBooking(booking.status, next)) {
      throw new BadRequestException(`Cannot move booking from ${booking.status} to ${next}`);
    }
    if (!ALLOWED_BY_ROLE[role].includes(next)) {
      throw new ForbiddenException(`A ${role} cannot set status ${next}`);
    }

    const patch: Record<string, unknown> = { status: next };
    if (next === 'confirmed') patch.confirmed_at = new Date().toISOString();
    if (vendorNote !== undefined) patch.vendor_note = vendorNote;

    const { data, error } = await this.supabase.db
      .from('bookings')
      .update(patch)
      .eq('id', bookingId)
      .select('*')
      .single();
    if (error || !data) {
      // 23P01: the bookings_no_overlap exclusion constraint — another booking
      // for this vehicle was confirmed for overlapping dates since we checked.
      if (error?.code === '23P01') {
        throw new ConflictException('Those dates were just taken by another booking');
      }
      throw new BadRequestException(error?.message ?? 'Transition failed');
    }

    const updated = data as Booking;
    if (next === 'confirmed' || next === 'rejected' || next === 'cancelled') {
      await this.notifications.notifyBookingEvent(updated, next);
    }
    return updated;
  }

  /** A single booking, only if the caller is a party to it (or admin). */
  async getForUser(bookingId: string, userId: string, role: UserRole): Promise<Booking> {
    return this.getOwned(bookingId, userId, role);
  }

  // --- helpers --------------------------------------------------------------

  private async getOwned(bookingId: string, userId: string, role: UserRole): Promise<Booking> {
    const { data, error } = await this.supabase.db
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();
    if (error || !data) throw new NotFoundException('Booking not found');
    const booking = data as Booking;

    if (role === 'admin') return booking;
    if (role === 'customer' && booking.customer_id === userId) return booking;
    if (role === 'vendor') {
      const vendor = await this.supabase.db
        .from('vendors')
        .select('id')
        .eq('profile_id', userId)
        .maybeSingle();
      if (vendor.data && booking.vendor_id === vendor.data.id) return booking;
    }
    throw new ForbiddenException('Not your booking');
  }

  /** Inclusive day count — a same-day return is one rental day. */
  private rentalDays(start: string, end: string): number {
    const ms = Date.parse(end) - Date.parse(start);
    if (Number.isNaN(ms) || ms < 0) throw new BadRequestException('Invalid date range');
    return Math.floor(ms / 86_400_000) + 1;
  }
}
