import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { computeDepositXaf } from '@karu/shared';
import type { Booking, PaymentStatus, UserRole } from '@karu/shared';
import { SupabaseService } from '../supabase/supabase.service';
import { dbErrorMessage } from '../supabase/db-error';
import { BookingsService } from '../bookings/bookings.service';
import {
  ManualPaymentProvider,
  StripeCardProvider,
  type DepositIntent,
  type PaymentProviderAdapter,
} from './provider';

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
   * Chosen from config at boot: with Stripe keys present, card deposits are
   * real; without them, the manual placeholder that never lies ships.
   * Everything else in the app is written against the interface.
   */
  private readonly adapter: PaymentProviderAdapter;

  constructor(
    config: ConfigService,
    private readonly supabase: SupabaseService,
    private readonly bookings: BookingsService,
  ) {
    const secretKey = config.get<string>('STRIPE_SECRET_KEY');
    const webhookSecret = config.get<string>('STRIPE_WEBHOOK_SECRET');

    // Half a configuration is the dangerous kind: charging without a webhook
    // secret means money could be taken but never marked received. Refuse to
    // boot rather than run like that.
    if (Boolean(secretKey) !== Boolean(webhookSecret)) {
      throw new Error(
        'STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET must be set together (or neither)',
      );
    }

    this.adapter =
      secretKey && webhookSecret
        ? new StripeCardProvider({
            secretKey,
            webhookSecret,
            webAppUrl:
              config.get<string>('WEB_APP_URL') ??
              config.get<string>('CORS_ORIGIN')?.split(',')[0]?.trim() ??
              'http://localhost:5173',
          })
        : new ManualPaymentProvider();
  }

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
    if (error || !data) throw new BadRequestException(dbErrorMessage(error, 'Could not update payment'));
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

    // Signature checked out but the event isn't one we act on — acknowledge
    // it so the provider stops retrying, and touch nothing.
    if (!event) return { updated: false, ignored: true };

    const { data, error } = await this.supabase.db
      .from('payments')
      .update({ status: event.status })
      .eq('provider_ref', event.providerRef)
      .select('*')
      .maybeSingle();
    if (error) throw new BadRequestException(dbErrorMessage(error, 'Could not update payment status'));
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
    if (error || !data) throw new BadRequestException(dbErrorMessage(error, 'Could not create payment'));
    return data as PaymentRow;
  }
}
