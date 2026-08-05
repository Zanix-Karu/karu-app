import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { canTransitionBooking, quoteBooking } from '@karu/shared';
import type { Booking, BookingStatus, UserRole } from '@karu/shared';
import { SupabaseService } from '../supabase/supabase.service';
import { VehiclesService } from '../vehicles/vehicles.service';
import { VendorsService } from '../vendors/vendors.service';
import { assertValidWindow } from '../vehicles/dates';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateBookingDto } from './dto';

/**
 * "Jean Mbarga" -> "Jean M." — enough for a vendor to greet the right person
 * at pick-up without exposing the full identity.
 */
function shortName(fullName: string | null | undefined): string {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Customer';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

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
    private readonly vendors: VendorsService,
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

    // Driver and delivery are both the vendor's to offer, so both are checked
    // against what the vendor actually sells rather than taken from the client.
    const vendor = await this.vendors.getById(vehicle.vendor_id);
    const withDriver = dto.with_driver ?? vehicle.driver_option === 'required';
    if (withDriver && vehicle.driver_option === 'none') {
      throw new BadRequestException('This car is not offered with a driver');
    }
    if (!withDriver && vehicle.driver_option === 'required') {
      throw new BadRequestException('This car is only offered with a driver');
    }

    const deliveryType = dto.delivery_type ?? 'pickup_point';
    if (deliveryType === 'address' && vendor.delivery_fee_xaf === null) {
      throw new BadRequestException('This provider does not deliver to an address');
    }
    if (deliveryType === 'airport' && vendor.airport_fee_xaf === null) {
      throw new BadRequestException('This provider does not offer airport pickup');
    }
    if (deliveryType === 'address' && !dto.delivery_address?.trim()) {
      throw new BadRequestException('An address is required for delivery');
    }

    // One shared quote function, so what the customer was shown before
    // committing is arithmetically the same as what is stored.
    const quote = quoteBooking({
      startDate: dto.start_date,
      endDate: dto.end_date,
      dailyRateXaf: vehicle.daily_rate_xaf,
      withDriver,
      driverDailyRateXaf: vehicle.driver_daily_rate_xaf,
      deliveryType,
      deliveryFeeXaf: vendor.delivery_fee_xaf,
      airportFeeXaf: vendor.airport_fee_xaf,
    });

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
        with_driver: withDriver,
        driver_fee_xaf: quote.driverXaf,
        delivery_type: deliveryType,
        delivery_address: dto.delivery_address?.trim() || null,
        delivery_fee_xaf: quote.deliveryXaf,
        pickup_time: dto.pickup_time ?? null,
        daily_rate_xaf: vehicle.daily_rate_xaf,
        total_xaf: quote.totalXaf,
        deposit_xaf: quote.depositXaf,
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

  /**
   * Booking detail, shaped for who is asking. Every role can open every
   * booking they are party to, but they see different parties:
   *
   *   customer -> the vehicle and the provider (business name, city, phone —
   *               all already public in the directory)
   *   vendor   -> the vehicle and the customer's DISPLAY NAME ONLY. Customer
   *               phone and email are never exposed to vendors; the MVP plan
   *               and marketplace spec both require all contact to run
   *               through Karu.
   *   admin    -> both sides in full, since the team runs operations and
   *               coordinates pick-ups by hand.
   */
  async getDetailForUser(bookingId: string, userId: string, role: UserRole) {
    const booking = await this.getOwned(bookingId, userId, role);

    const [vehicleRes, vendorRes, customerRes] = await Promise.all([
      this.supabase.db
        .from('vehicles')
        .select('id, make, model, year, category, transmission, seats, photos, city, pickup_locations')
        .eq('id', booking.vehicle_id)
        .maybeSingle(),
      this.supabase.db
        .from('vendors')
        .select('id, business_name, city, contact_phone, contact_email')
        .eq('id', booking.vendor_id)
        .maybeSingle(),
      this.supabase.db
        .from('profiles')
        .select('id, full_name, phone')
        .eq('id', booking.customer_id)
        .maybeSingle(),
    ]);

    const vendorRow = vendorRes.data as
      | { id: string; business_name: string; city: string; contact_phone: string | null; contact_email: string | null }
      | null;
    const customerRow = customerRes.data as
      | { id: string; full_name: string | null; phone: string | null }
      | null;

    // Provider block: contact is public directory information, so customers
    // and admins both get it. Vendors do not need their own details echoed.
    const vendor =
      vendorRow && role !== 'vendor'
        ? {
            id: vendorRow.id,
            business_name: vendorRow.business_name,
            city: vendorRow.city,
            contact_phone: vendorRow.contact_phone,
            contact_email: role === 'admin' ? vendorRow.contact_email : null,
          }
        : vendorRow
          ? { id: vendorRow.id, business_name: vendorRow.business_name, city: vendorRow.city }
          : null;

    // Customer block: the customer themself does not need it; a vendor gets a
    // display name and nothing else; an admin gets everything.
    let customer: Record<string, unknown> | null = null;
    if (role === 'vendor') {
      customer = { display_name: shortName(customerRow?.full_name) };
    } else if (role === 'admin') {
      const email = await this.emailOf(booking.customer_id);
      customer = {
        display_name: customerRow?.full_name ?? 'Customer',
        full_name: customerRow?.full_name ?? null,
        phone: customerRow?.phone ?? null,
        email,
      };
    }

    return { ...booking, vehicle: vehicleRes.data ?? null, vendor, customer };
  }

  /**
   * Send a message about a booking to the Karu team. Available to either
   * party; the team relays it on, which is how the MVP plan intends
   * customer/vendor communication to work while contact details stay private.
   */
  async relayMessage(bookingId: string, userId: string, role: UserRole, message: string) {
    const booking = await this.getOwned(bookingId, userId, role);
    const email = await this.emailOf(userId);
    return this.notifications.relayBookingMessage({
      bookingId: booking.id,
      reference: booking.reference,
      fromRole: role,
      fromEmail: email,
      message,
    });
  }

  /** Auth email for a profile — admin-only paths call this. */
  private async emailOf(profileId: string): Promise<string | null> {
    const { data } = await this.supabase.db.auth.admin.getUserById(profileId);
    return data?.user?.email ?? null;
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
