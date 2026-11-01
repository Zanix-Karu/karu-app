import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { computeDepositXaf } from '@karu/shared';
import type { Booking, PaymentMethod, PaymentStatus, UserRole } from '@karu/shared';
import { SupabaseService } from '../supabase/supabase.service';
import { dbErrorMessage } from '../supabase/db-error';
import { BookingsService } from '../bookings/bookings.service';
import {
  ManualPaymentProvider,
  NotchPayMobileMoneyProvider,
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
   * Chosen from config at boot. Card (Stripe) serves the diaspora, mobile
   * money (Notch Pay: MTN and Orange) serves customers in Cameroon; either,
   * both or neither may be configured. With neither, the manual placeholder
   * that never lies ships. Everything else is written against the interface.
   */
  private readonly adapters = new Map<PaymentMethod, PaymentProviderAdapter>();
  private readonly manual = new ManualPaymentProvider();

  constructor(
    config: ConfigService,
    private readonly supabase: SupabaseService,
    private readonly bookings: BookingsService,
  ) {
    const webAppUrl =
      config.get<string>('WEB_APP_URL') ??
      config.get<string>('CORS_ORIGIN')?.split(',')[0]?.trim() ??
      'http://localhost:5173';

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
    if (secretKey && webhookSecret) {
      this.adapters.set('card', new StripeCardProvider({ secretKey, webhookSecret, webAppUrl }));
    }

    const notchKey = config.get<string>('NOTCHPAY_PUBLIC_KEY');
    const notchHash = config.get<string>('NOTCHPAY_WEBHOOK_HASH');
    if (Boolean(notchKey) !== Boolean(notchHash)) {
      throw new Error('NOTCHPAY_PUBLIC_KEY and NOTCHPAY_WEBHOOK_HASH must be set together (or neither)');
    }
    if (notchKey && notchHash) {
      this.adapters.set(
        'mobile_money',
        new NotchPayMobileMoneyProvider({ publicKey: notchKey, webhookHash: notchHash, webAppUrl }),
      );
    }
  }

  /** Is any real provider wired up? Screens use this to avoid over-promising. */
  get canCharge(): boolean {
    return this.adapters.size > 0;
  }

  /** The methods a customer can pick from, in no particular order. */
  get methods(): PaymentMethod[] {
    return [...this.adapters.keys()];
  }

  private adapterFor(method?: PaymentMethod): PaymentProviderAdapter {
    if (method) {
      const chosen = this.adapters.get(method);
      if (!chosen) throw new BadRequestException('That payment method is not available');
      return chosen;
    }
    return this.adapters.values().next().value ?? this.manual;
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
    method?: PaymentMethod,
  ): Promise<DepositIntent & { amountXaf: number; status: PaymentStatus }> {
    const adapter = this.adapterFor(method);
    const booking = await this.bookings.getForUser(bookingId, userId, role);

    if (booking.customer_id !== userId && role !== 'admin') {
      throw new ForbiddenException('Only the customer can pay for this booking');
    }
    if (booking.status === 'cancelled' || booking.status === 'rejected') {
      throw new BadRequestException('This booking is no longer active');
    }

    const amountXaf = booking.deposit_xaf ?? computeDepositXaf(booking.total_xaf);
    const existing = await this.rowFor(bookingId);
    if (existing && (existing.status === 'held' || existing.status === 'released')) {
      throw new BadRequestException('The deposit for this booking is already paid');
    }

    let payment =
      existing ??
      (await this.insert({
        booking_id: bookingId,
        provider: adapter.name,
        amount_xaf: amountXaf,
        status: 'pending',
      }));

    // Switching method before paying (card abandoned, trying MoMo instead) is
    // normal. The row follows the method, and the old provider reference is
    // dropped so a late callback from the abandoned attempt matches nothing.
    if (payment.provider !== adapter.name) {
      const { data } = await this.supabase.db
        .from('payments')
        .update({ provider: adapter.name, provider_ref: null, status: 'pending' })
        .eq('id', payment.id)
        .select('*')
        .single();
      if (data) payment = data as PaymentRow;
    }

    const [{ data: user }, { data: profile }] = await Promise.all([
      this.supabase.db.auth.admin.getUserById(booking.customer_id),
      this.supabase.db.from('profiles').select('phone').eq('id', booking.customer_id).maybeSingle(),
    ]);
    const intent = await adapter.createDepositIntent({
      booking,
      amountXaf: payment.amount_xaf,
      paymentId: payment.id,
      customerEmail: user?.user?.email ?? null,
      customerPhone: (profile as { phone?: string | null } | null)?.phone ?? null,
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
      chargingEnabled: this.canCharge,
      /** Which ways to pay are on offer (card, mobile money). */
      methods: this.methods,
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
        provider: this.manual.name,
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
  async handleWebhook(
    rawBody: string,
    headers: Record<string, string | undefined>,
    method: PaymentMethod = 'card',
  ) {
    const adapter = this.adapters.get(method) ?? this.manual;
    let event;
    try {
      event = adapter.parseWebhook(rawBody, headers);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }

    // Signature checked out but the event isn't one we act on — acknowledge
    // it so the provider stops retrying, and touch nothing.
    if (!event) return { updated: false, ignored: true };

    // Matched on the provider's reference, or on our own id when the provider
    // echoes it back; and only on a row still owned by this provider, so a
    // callback from an abandoned attempt can't settle a switched payment.
    let q = this.supabase.db
      .from('payments')
      .update({ status: event.status })
      .eq('provider', adapter.name);
    q = event.paymentId
      ? q.or(`provider_ref.eq.${event.providerRef},id.eq.${event.paymentId}`)
      : q.eq('provider_ref', event.providerRef);
    const { data, error } = await q.select('*').maybeSingle();
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
