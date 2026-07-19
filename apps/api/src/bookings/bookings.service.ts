import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { canTransitionBooking } from '@karu/shared';
import type { Booking, BookingStatus, UserRole } from '@karu/shared';
import { SupabaseService } from '../supabase/supabase.service';
import { VehiclesService } from '../vehicles/vehicles.service';
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
  ) {}

  /** A customer requests a vehicle. Price is snapshotted from the vehicle. */
  async create(customerId: string, dto: CreateBookingDto): Promise<Booking> {
    const vehicle = await this.vehicles.getById(dto.vehicle_id);
    if (vehicle.status !== 'active') {
      throw new BadRequestException('Vehicle is not available for booking');
    }

    const days = this.rentalDays(dto.start_date, dto.end_date);
    const total = vehicle.daily_rate_xaf * days;

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
        status: 'requested',
      })
      .select('*')
      .single();
    if (error || !data) throw new BadRequestException(error?.message ?? 'Could not create booking');
    return data as Booking;
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
    if (error || !data) throw new BadRequestException(error?.message ?? 'Transition failed');
    return data as Booking;
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
