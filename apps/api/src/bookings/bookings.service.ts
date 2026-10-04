import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'node:crypto';
import {
  CODE_ATTEMPT_LIMIT,
  canTransitionBooking,
  depositRefundDue,
  quoteBooking,
  selfDriveBlocker,
} from '@karu/shared';
import type { Booking, BookingStatus, UserRole } from '@karu/shared';
import { SupabaseService } from '../supabase/supabase.service';
import { dbErrorMessage } from '../supabase/db-error';
import { VehiclesService } from '../vehicles/vehicles.service';
import { VendorsService } from '../vendors/vendors.service';
import { assertValidWindow } from '../vehicles/dates';
import { NotificationsService } from '../notifications/notifications.service';
import { VerificationService } from '../verification/verification.service';
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

/**
 * REQ-6: a short, easy-to-read-aloud handover/return code — same idea as a
 * food-delivery PIN. Four digits keeps it readable; what stops guessing is
 * the CODE_ATTEMPT_LIMIT lockout (0030), not the length. crypto.randomInt
 * rather than Math.random so the code can't be predicted from earlier ones.
 */
function generateHandoverCode(): string {
  return String(randomInt(1000, 10000));
}

/**
 * Last nine digits: a Cameroon national number with any +237 / 00237 / spaces
 * stripped, and close enough to a UK one, for "is this the same phone".
 */
function phoneKey(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length >= 8 ? digits.slice(-9) : null;
}

/** Days before pick-up when a provider's phone is shown even without a deposit. */
const CONTACT_REVEAL_DAYS_BEFORE = 1;

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
    @Optional() private readonly config?: ConfigService,
    @Optional() private readonly verification?: VerificationService,
  ) {}

  /** Self-drive needs a verified customer (0032). REQUIRE_CUSTOMER_VERIFICATION=false switches it off. */
  private get customerVerificationRequired(): boolean {
    return this.config?.get<string>('REQUIRE_CUSTOMER_VERIFICATION') !== 'false';
  }

  /**
   * A provider accepting a self-drive request is about to hand a car to this
   * person, so the ID check has to be done and has to cover the dates: old
   * enough on day one, licence still valid on the last day. With a driver the
   * customer never takes the wheel, so none of this applies.
   */
  private async assertCustomerMayDrive(booking: Booking): Promise<void> {
    if (booking.with_driver || !this.customerVerificationRequired) return;
    const { data } = await this.supabase.db
      .from('profiles')
      .select('verification_status, date_of_birth, licence_expires_at')
      .eq('id', booking.customer_id)
      .maybeSingle();
    const p = data as {
      verification_status?: 'unverified' | 'pending' | 'verified' | 'rejected';
      date_of_birth?: string | null;
      licence_expires_at?: string | null;
    } | null;
    const blocker = selfDriveBlocker({
      status: p?.verification_status ?? 'unverified',
      dateOfBirth: p?.date_of_birth ?? null,
      licenceExpiresAt: p?.licence_expires_at ?? null,
      startDate: booking.start_date,
      endDate: booking.end_date,
    });
    if (blocker === 'not_verified') {
      throw new BadRequestException(
        "The customer's ID check isn't finished yet. You can accept once Karu has verified their licence.",
      );
    }
    if (blocker === 'too_young') {
      throw new BadRequestException('The customer is under the minimum age to drive themselves');
    }
    if (blocker === 'licence_expires') {
      throw new BadRequestException("The customer's driving licence expires before the end of the rental");
    }
  }

  /**
   * Must the deposit be in before the car changes hands? On by default once a
   * provider that can actually take money is configured (otherwise nobody
   * could ever start a trip); REQUIRE_DEPOSIT_BEFORE_HANDOVER overrides either
   * way, so ops can enforce it while deposits are still recorded by hand.
   */
  private get depositRequiredForHandover(): boolean {
    const explicit = this.config?.get<string>('REQUIRE_DEPOSIT_BEFORE_HANDOVER');
    if (explicit === 'true') return true;
    if (explicit === 'false') return false;
    return Boolean(
      this.config?.get<string>('STRIPE_SECRET_KEY') || this.config?.get<string>('NOTCHPAY_SECRET_KEY'),
    );
  }

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
    // Verification is a gate (onboarding spec §12): an unverified vendor's
    // cars are hidden from browse, and a direct link can't book them either.
    if (vendor.status !== 'verified') {
      throw new BadRequestException('This provider is not yet verified');
    }
    await this.assertNotOwnVehicle(customerId, vendor.id);

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
      weeklyRateXaf: vehicle.weekly_rate_xaf,
      monthlyRateXaf: vehicle.monthly_rate_xaf,
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
    if (error || !data) throw new BadRequestException(dbErrorMessage(error, 'Could not create booking'));

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
    if (error) throw new NotFoundException(dbErrorMessage(error, 'Could not load bookings'));
    return ((data ?? []) as Booking[]).map((b) => this.hideCodesUnlessCustomer(b, role));
  }

  /**
   * REQ-6: handover_code/return_code are for the customer to hold and read
   * aloud at the exchange — a vendor (or admin) reading them straight from
   * the API would defeat the point of a verbal handshake, the same way the
   * app never hands a vendor the customer's phone number directly.
   */
  private hideCodesUnlessCustomer(booking: Booking, role: UserRole): Booking {
    if (role === 'customer') return booking;
    return { ...booking, handover_code: null, return_code: null };
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
    code?: string,
  ): Promise<Booking> {
    const booking = await this.getOwned(bookingId, userId, role);

    if (!canTransitionBooking(booking.status, next)) {
      throw new BadRequestException(`Cannot move booking from ${booking.status} to ${next}`);
    }
    if (!ALLOWED_BY_ROLE[role].includes(next)) {
      throw new ForbiddenException(`A ${role} cannot set status ${next}`);
    }

    // Admin keeps its override here too: ops may have checked ID in person.
    if (next === 'confirmed' && role !== 'admin') await this.assertCustomerMayDrive(booking);

    const handingOver = booking.status === 'confirmed' && next === 'in_progress';
    const handingBack = booking.status === 'in_progress' && next === 'completed';

    /**
     * REQ-6: a vendor driving the handover or return in person confirms it
     * against the code the customer holds — Uber-Eats style — rather than a
     * click alone deciding a car changed hands. Admin keeps the unconditional
     * override it already has everywhere else, for the case the code is lost
     * or disputed; ops resolves that by hand, same as everything else it
     * already overrides.
     */
    if (role === 'vendor' && (handingOver || handingBack)) {
      // Evidence first: the car's condition is recorded before the code,
      // because once the code is read out the trip has moved on. A chauffeur
      // rental never leaves the provider's hands, so there is nothing to
      // dispute and no report is asked for.
      if (!booking.with_driver) {
        await this.assertInspected(booking.id, handingOver ? 'handover' : 'return');
      }
      if (handingOver && this.depositRequiredForHandover && !(await this.depositHeld(booking.id))) {
        throw new BadRequestException(
          'The deposit has not been received yet. The car can be handed over once it is paid.',
        );
      }
      await this.checkCode(booking, handingOver ? 'handover' : 'return', code);
    }

    /**
     * Cancelling someone else's plans needs a reason. A provider dropping a
     * customer they already accepted is the case that matters most, and the
     * reason is what the admin reads when that provider's cancellations pile
     * up; a customer's reason is optional, it's their own trip.
     */
    if (next === 'cancelled' && role === 'vendor' && booking.status === 'confirmed') {
      if (!vendorNote || vendorNote.trim().length < 10) {
        throw new BadRequestException('Tell the customer why you are cancelling (at least 10 characters)');
      }
    }

    const patch: Record<string, unknown> = { status: next };
    if (next === 'confirmed') {
      patch.confirmed_at = new Date().toISOString();
      // Minted now, well before either handover moment, so both are already
      // on the booking the instant the customer can see it.
      patch.handover_code = generateHandoverCode();
      patch.return_code = generateHandoverCode();
    }
    if (next === 'completed') patch.completed_at = new Date().toISOString();
    if (next === 'cancelled') {
      patch.cancelled_at = new Date().toISOString();
      patch.cancelled_by = role;
      patch.cancellation_reason = vendorNote?.trim() || null;
      patch.deposit_refund_due = depositRefundDue({
        cancelledBy: role,
        status: booking.status,
        startDate: booking.start_date,
      });
    }
    // A successful code resets the counter for the next exchange.
    if (handingOver || handingBack) patch.code_failed_attempts = 0;
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
      throw new BadRequestException(dbErrorMessage(error, 'Transition failed'));
    }

    const updated = data as Booking;
    if (next === 'confirmed' || next === 'rejected' || next === 'cancelled') {
      await this.notifications.notifyBookingEvent(updated, next);
    }
    return this.hideCodesUnlessCustomer(updated, role);
  }

  /** A single booking, only if the caller is a party to it (or admin). */
  async getForUser(bookingId: string, userId: string, role: UserRole): Promise<Booking> {
    return this.hideCodesUnlessCustomer(await this.getOwned(bookingId, userId, role), role);
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
    const booking = this.hideCodesUnlessCustomer(await this.getOwned(bookingId, userId, role), role);

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

    // Provider block. This used to hand the phone to any customer on the
    // grounds that it was "public directory information" — which stopped being
    // true when SEC-1 took contact details out of the public vendor payload.
    // Left as it was, merely *requesting* a booking would surface a stranger's
    // number before they had agreed to anything.
    //
    // A booking the provider has accepted is the point where a customer has a
    // real need to reach them: to arrange the handover. Admins keep full
    // access, since the team coordinates pick-ups by hand.
    //
    // 0030: but "accepted" alone costs nothing, so it was also the cheapest
    // way to get a provider's number and cut Karu out: request, get
    // confirmed, copy the number, cancel. The phone now waits until the
    // deposit is in, or until the day before pick-up when the handover has
    // to be arranged regardless. Until then the chat covers it.
    const accepted =
      booking.status === 'confirmed' ||
      booking.status === 'in_progress' ||
      booking.status === 'completed';
    const handoverIsClose =
      Date.parse(`${booking.start_date}T00:00:00Z`) - Date.now() <=
      CONTACT_REVEAL_DAYS_BEFORE * 86_400_000;
    const contactUnlocked =
      role === 'admin' ||
      (accepted && (booking.status !== 'confirmed' || handoverIsClose || (await this.depositHeld(booking.id))));
    const vendor =
      vendorRow && role !== 'vendor'
        ? {
            id: vendorRow.id,
            business_name: vendorRow.business_name,
            city: vendorRow.city,
            contact_phone: contactUnlocked ? vendorRow.contact_phone : null,
            contact_email: role === 'admin' ? vendorRow.contact_email : null,
            /** True while the phone is held back; the screen says why. */
            contact_locked: accepted && !contactUnlocked,
          }
        : vendorRow
          ? { id: vendorRow.id, business_name: vendorRow.business_name, city: vendorRow.city }
          : null;

    // Customer block: the customer themself does not need it; a vendor gets a
    // display name and nothing else; an admin gets everything.
    let customer: Record<string, unknown> | null = null;
    if (role === 'vendor') {
      customer = { display_name: shortName(customerRow?.full_name) };
      // 0032: once accepted, the provider sees who to expect: the verified
      // name and selfie, to match against the person and their licence.
      if (accepted && booking.status !== 'completed' && this.verification) {
        customer = { ...customer, identity: await this.verification.handoverIdentity(booking.customer_id) };
      }
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

  /**
   * Either party asks Karu to step in (0023).
   *
   * Deliberately available on any booking the caller is party to, at any
   * status: the moments people most need help are a rejected request they do
   * not understand and a completed rental with a dispute about damage, not
   * only the happy middle. getOwned() is the authorisation, so a stranger
   * cannot raise a flag on someone else's booking.
   *
   * Re-requesting while one is already open is a no-op rather than an error —
   * someone pressing the button twice is not a failure state, and resetting
   * the timestamp would push them back down an admin queue sorted by age.
   */
  async requestAssistance(
    bookingId: string,
    userId: string,
    role: UserRole,
    note?: string,
  ): Promise<Booking> {
    const booking = await this.getOwned(bookingId, userId, role);
    const alreadyOpen =
      booking.assistance_requested_at && !booking.assistance_resolved_at;
    if (alreadyOpen) return booking;

    const { data, error } = await this.supabase.db
      .from('bookings')
      .update({
        assistance_requested_at: new Date().toISOString(),
        assistance_requested_by: userId,
        assistance_note: note ?? null,
        assistance_resolved_at: null,
      })
      .eq('id', bookingId)
      .select('*')
      .single();
    if (error || !data) throw new BadRequestException(dbErrorMessage(error, 'Could not raise the request'));
    return data as Booking;
  }

  /** An admin marks the request handled. The timestamps stay as history. */
  async resolveAssistance(bookingId: string): Promise<Booking> {
    const { data, error } = await this.supabase.db
      .from('bookings')
      .update({ assistance_resolved_at: new Date().toISOString() })
      .eq('id', bookingId)
      .select('*')
      .single();
    if (error || !data) throw new NotFoundException('Booking not found');
    return data as Booking;
  }

  /**
   * Check a handover/return code, counting wrong guesses. At
   * CODE_ATTEMPT_LIMIT the booking locks and lands in the admin's assistance
   * queue: past that point it's a conversation with a person, not a keypad.
   */
  private async checkCode(
    booking: Booking,
    kind: 'handover' | 'return',
    code: string | undefined,
  ): Promise<void> {
    if (booking.code_locked_at) {
      throw new ForbiddenException(
        'Too many wrong codes. Karu support has been told and will sort this out with you.',
      );
    }
    // Strip spaces a vendor may type when reading "12 34" back.
    const given = code?.replace(/\s+/g, '') ?? '';
    const expected = kind === 'handover' ? booking.handover_code : booking.return_code;
    if (given && expected && given === expected) return;

    const attempts = (booking.code_failed_attempts ?? 0) + 1;
    const locked = attempts >= CODE_ATTEMPT_LIMIT;
    const now = new Date().toISOString();
    await this.supabase.db
      .from('bookings')
      .update({
        code_failed_attempts: attempts,
        ...(locked
          ? {
              code_locked_at: now,
              assistance_requested_at: booking.assistance_requested_at && !booking.assistance_resolved_at
                ? booking.assistance_requested_at
                : now,
              assistance_note: `Code locked after ${attempts} wrong attempts`,
              assistance_resolved_at: null,
            }
          : {}),
      })
      .eq('id', booking.id);

    if (locked) {
      throw new ForbiddenException(
        'Too many wrong codes. Karu support has been told and will sort this out with you.',
      );
    }
    const left = CODE_ATTEMPT_LIMIT - attempts;
    throw new BadRequestException(
      `Incorrect or missing ${kind} code. ` +
        `${left} ${left === 1 ? 'try' : 'tries'} left.`,
    );
  }

  /** Has the provider recorded the car's condition for this stage? */
  private async assertInspected(bookingId: string, stage: 'handover' | 'return'): Promise<void> {
    const { data } = await this.supabase.db
      .from('booking_inspections')
      .select('id')
      .eq('booking_id', bookingId)
      .eq('stage', stage)
      .eq('recorded_role', 'vendor')
      .maybeSingle();
    if (!data) {
      throw new BadRequestException(
        stage === 'handover'
          ? 'Record the car\'s condition (photos, fuel, mileage) before handing it over'
          : 'Record the car\'s condition (photos, fuel, mileage) before closing the trip',
      );
    }
  }

  /** True once the deposit is actually in (held, or already released to the vendor). */
  private async depositHeld(bookingId: string): Promise<boolean> {
    const { data } = await this.supabase.db
      .from('payments')
      .select('status')
      .eq('booking_id', bookingId)
      .maybeSingle();
    const status = (data as { status?: string } | null)?.status;
    return status === 'held' || status === 'released';
  }

  /**
   * A provider booking their own car through a second account, to collect
   * reviews they wrote themselves. They would hold both codes, so nothing
   * downstream would catch it. Matched on the identifiers a second account
   * would most likely share: phone and email, against the business's contact
   * details and the owner's own login.
   */
  private async assertNotOwnVehicle(customerId: string, vendorId: string): Promise<void> {
    const { data: vendorRow } = await this.supabase.db
      .from('vendors')
      .select('profile_id, contact_phone, whatsapp_number, contact_email')
      .eq('id', vendorId)
      .maybeSingle();
    const vendor = vendorRow as {
      profile_id: string;
      contact_phone: string | null;
      whatsapp_number: string | null;
      contact_email: string | null;
    } | null;
    if (!vendor) return;
    if (vendor.profile_id === customerId) {
      throw new ForbiddenException('You cannot book a car you list yourself');
    }

    const [customerProfile, ownerProfile, customerEmail, ownerEmail] = await Promise.all([
      this.supabase.db.from('profiles').select('phone').eq('id', customerId).maybeSingle(),
      this.supabase.db.from('profiles').select('phone').eq('id', vendor.profile_id).maybeSingle(),
      this.emailOf(customerId),
      this.emailOf(vendor.profile_id),
    ]);

    const customerPhone = phoneKey((customerProfile.data as { phone?: string | null } | null)?.phone);
    const vendorPhones = new Set(
      [
        vendor.contact_phone,
        vendor.whatsapp_number,
        (ownerProfile.data as { phone?: string | null } | null)?.phone,
      ]
        .map(phoneKey)
        .filter((p): p is string => Boolean(p)),
    );
    const vendorEmails = new Set(
      [vendor.contact_email, ownerEmail]
        .filter((e): e is string => Boolean(e))
        .map((e) => e.trim().toLowerCase()),
    );

    const samePhone = customerPhone !== null && vendorPhones.has(customerPhone);
    const sameEmail = customerEmail !== null && vendorEmails.has(customerEmail.trim().toLowerCase());
    if (samePhone || sameEmail) {
      throw new ForbiddenException('You cannot book a car you list yourself');
    }
  }

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
