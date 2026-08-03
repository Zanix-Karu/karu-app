import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { computeDepositXaf } from '@karu/shared';
import type { Booking, PaymentStatus, UserRole } from '@karu/shared';
import { SupabaseService } from '../supabase/supabase.service';
import { BookingsService } from '../bookings/bookings.service';
import { ManualPaymentProvider, type DepositIntent, type PaymentProviderAdapter } from './provider';

export interface PaymentRow {
  id: string;
  booking_id: string;
  provider: string;
  amount_xaf: number;
  status: PaymentStatus;
  provider_ref: string | null;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class PaymentsService {
  /**
   * Swap this for a real adapter once Gate A is answered and an account
   * exists. Everything else in the app is written against the interface.
   */
  private readonly adapter: PaymentProviderAdapter = new ManualPaymentProvider();

  constructor(
    private readonly supabase: SupabaseService,
    private readonly bookings: BookingsService,
  ) {}

  /** Is a real provider wired up? Screens use this to avoid over-promising. */
  get canCharge(): boolean {
    return this.adapter.canCharge;
  }

  /**
   * Start (or re-read) the deposit for a booking. Idempotent: the payments
   * table has UNIQUE(booking_id), and an existing row is returned rather than
   * a second one created, so a double-click cannot produce two charges.
   */
  async createDepositIntent(
    bookingId: string,
    userId: string,
    role: UserRole,
  ): Promise<DepositIntent & { amountXaf: number; status: PaymentStatus }> {
    const booking = await this.bookings.getForUser(bookingId, userId, role);

    if (booking.customer_id !== userId && role !== 'admin') {
      throw new ForbiddenException('Only the customer can pay for this booking');
    }
    if (booking.status === 'cancelled' || booking.status === 'rejected') {
      throw new BadRequestException('This booking is no longer active');
    }

    const amountXaf = booking.deposit_xaf ?? computeDepositXaf(booking.total_xaf);
    const existing = await this.rowFor(bookingId);

    const payment =
      existing ??
      (await this.insert({
        booking_id: bookingId,
        provider: this.adapter.name,
        amount_xaf: amountXaf,
        status: 'pending',
      }));

    const intent = await this.adapter.createDepositIntent({
      booking,
      amountXaf: payment.amount_xaf,
      paymentId: payment.id,
    });

    if (intent.providerRef && intent.providerRef !== payment.provider_ref) {
      await this.supabase.db
        .from('payments')
        .update({ provider_ref: intent.providerRef })
        .eq('id', payment.id);
    }

    return {
      ...intent,
      paymentId: payment.id,
      amountXaf: payment.amount_xaf,
      status: payment.status,
    };
  }

  /** Current payment state for a booking, for whoever may see the booking. */
  async forBooking(bookingId: string, userId: string, role: UserRole) {
    await this.bookings.getForUser(bookingId, userId, role);
    const row = await this.rowFor(bookingId);
    return {
      payment: row,
      /** False until a provider that can actually charge is configured. */
      chargingEnabled: this.adapter.canCharge,
    };
  }

  /**
   * Record a deposit the team collected off-platform. This is how money is
   * reconciled while payments are manual — an explicit admin action, never
   * inferred, so nothing is ever marked paid without a human saying so.
   */
  async recordManualStatus(
    bookingId: string,
    status: Extract<PaymentStatus, 'held' | 'released' | 'refunded' | 'failed'>,
    reference?: string,
  ): Promise<PaymentRow> {
    const { data: bookingRow } = await this.supabase.db
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .maybeSingle();
    if (!bookingRow) throw new NotFoundException('Booking not found');
    const booking = bookingRow as Booking;

    const existing = await this.rowFor(bookingId);
    const row =
      existing ??
      (await this.insert({
        booking_id: bookingId,
        provider: this.adapter.name,
        amount_xaf: booking.deposit_xaf ?? computeDepositXaf(booking.total_xaf),
        status: 'pending',
      }));

    const { data, error } = await this.supabase.db
      .from('payments')
      .update({ status, provider_ref: reference ?? row.provider_ref })
      .eq('id', row.id)
      .select('*')
      .single();
    if (error || !data) throw new BadRequestException(error?.message ?? 'Could not update payment');
    return data as PaymentRow;
  }

  /**
   * Provider callback. With no real provider configured the adapter refuses
   * to parse, so this returns 400 rather than trusting an unsigned request —
   * an open endpoint that marks money received would be the worst possible
   * bug here.
   */
  async handleWebhook(rawBody: string, headers: Record<string, string | undefined>) {
    let event;
    try {
      event = this.adapter.parseWebhook(rawBody, headers);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }

    const { data, error } = await this.supabase.db
      .from('payments')
      .update({ status: event.status })
      .eq('provider_ref', event.providerRef)
      .select('*')
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('No payment matches that reference');
    return { updated: true, status: event.status };
  }

  // --- helpers ---------------------------------------------------------------

  private async rowFor(bookingId: string): Promise<PaymentRow | null> {
    const { data } = await this.supabase.db
      .from('payments')
      .select('*')
      .eq('booking_id', bookingId)
      .maybeSingle();
    return (data as PaymentRow) ?? null;
  }

  private async insert(row: Record<string, unknown>): Promise<PaymentRow> {
    const { data, error } = await this.supabase.db
      .from('payments')
      .insert(row)
      .select('*')
      .single();
    if (error || !data) throw new BadRequestException(error?.message ?? 'Could not create payment');
    return data as PaymentRow;
  }
}
