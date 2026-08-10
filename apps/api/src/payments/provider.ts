import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Booking, PaymentProvider as ProviderName } from '@karu/shared';

/**
 * The seam a real payment provider drops into.
 *
 * Karu's payment decision is deliberately open: Gate A of the MVP plan (can a
 * UK entity hold Cameroonian deposits without a licence?) has to be answered
 * by a lawyer before money moves, and the answer decides whether we use a UK
 * card service (Stripe/Wise) or local mobile money. So the app is built to
 * the interface rather than to a vendor, and ships today with a manual
 * implementation that records intent without pretending to charge anyone.
 *
 * Adding a real provider = one class implementing this + an env var. No
 * caller changes.
 */

export interface DepositIntent {
  /** Our payments.id — the row tracking this attempt. */
  paymentId: string;
  /** The provider's own reference, when it has one. */
  providerRef: string | null;
  /** Where to send the customer to pay. Null when nothing to redirect to. */
  redirectUrl: string | null;
  /** What the customer should be told to do next. */
  instructions: string;
  /** True only once money has genuinely been taken. */
  settled: boolean;
}

export interface WebhookEvent {
  providerRef: string;
  /** Maps onto payments.status. */
  status: 'held' | 'released' | 'refunded' | 'failed';
}

export interface PaymentProviderAdapter {
  /** Value stored in payments.provider. */
  readonly name: ProviderName;
  /** Whether this adapter can actually move money. */
  readonly canCharge: boolean;

  /**
   * Begin collecting a deposit. Implementations must be idempotent per
   * booking — calling twice returns the same intent rather than double
   * charging.
   */
  createDepositIntent(input: {
    booking: Booking;
    amountXaf: number;
    paymentId: string;
  }): Promise<Omit<DepositIntent, 'paymentId'>>;

  /**
   * Verify and parse a provider callback. Throws if the signature is not
   * valid — an unverified webhook must never be allowed to mark money as
   * received. Returns null for events that verified fine but are not ours to
   * act on (providers send many event types); the endpoint acknowledges those
   * without touching any payment.
   */
  parseWebhook(rawBody: string, headers: Record<string, string | undefined>): WebhookEvent | null;
}

/**
 * The placeholder that ships today.
 *
 * It records that a deposit is owed and hands the customer a reference, but
 * takes no money — the Karu team arranges the deposit off-platform, which is
 * exactly what the MVP plan assumes while Gate A is open. Crucially it never
 * reports `settled`, so no screen can claim a payment happened.
 */
export class ManualPaymentProvider implements PaymentProviderAdapter {
  readonly name = 'manual' as const;
  readonly canCharge = false;

  async createDepositIntent({ booking }: { booking: Booking; amountXaf: number; paymentId: string }) {
    return {
      providerRef: null,
      redirectUrl: null,
      instructions:
        `Quote ${booking.reference ?? 'your booking reference'} — the Karu team will contact ` +
        'you to arrange the deposit. Nothing has been charged.',
      settled: false,
    };
  }

  parseWebhook(): WebhookEvent {
    // No provider is configured, so any callback is unauthenticated by
    // definition and must be refused rather than trusted.
    throw new Error('No payment provider is configured to receive webhooks');
  }
}

/**
 * Card deposits via Stripe Checkout — the "UK card service" path the MVP plan
 * names for diaspora customers, behind two env vars (STRIPE_SECRET_KEY +
 * STRIPE_WEBHOOK_SECRET). Uses the raw REST API over fetch, matching how this
 * codebase talks to Resend, rather than pulling in the SDK.
 *
 * Money truth still only ever comes from the signed webhook: creating a
 * Checkout session never reports settled, and a payment is marked 'held'
 * exclusively when Stripe says the session completed and was paid.
 */
export class StripeCardProvider implements PaymentProviderAdapter {
  readonly name = 'card' as const;
  readonly canCharge = true;

  /** Webhook timestamps older than this are replays and get refused. */
  private static readonly TOLERANCE_SECONDS = 300;

  constructor(
    private readonly opts: {
      secretKey: string;
      webhookSecret: string;
      /** Where the customer lands after paying, e.g. https://app.getkaru.io */
      webAppUrl: string;
      /** Injectable for tests. */
      fetchFn?: typeof fetch;
      nowMs?: () => number;
    },
  ) {}

  async createDepositIntent({
    booking,
    amountXaf,
    paymentId,
  }: {
    booking: Booking;
    amountXaf: number;
    paymentId: string;
  }): Promise<Omit<DepositIntent, 'paymentId'>> {
    const base = this.opts.webAppUrl.replace(/\/$/, '');
    // XAF is a zero-decimal currency on Stripe: 25000 means 25 000 F CFA.
    const params = new URLSearchParams({
      mode: 'payment',
      client_reference_id: paymentId,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'xaf',
      'line_items[0][price_data][unit_amount]': String(amountXaf),
      'line_items[0][price_data][product_data][name]':
        `Karu booking deposit — ${booking.reference ?? booking.id}`,
      'metadata[payment_id]': paymentId,
      'metadata[booking_id]': booking.id,
      success_url: `${base}/bookings/${booking.id}?deposit=success`,
      cancel_url: `${base}/bookings/${booking.id}?deposit=cancelled`,
    });

    const doFetch = this.opts.fetchFn ?? fetch;
    const res = await doFetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.opts.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        // Same key per payment row → Stripe returns the same session instead
        // of minting a second charge for a double-click.
        'Idempotency-Key': `karu-deposit-${paymentId}`,
      },
      body: params.toString(),
    });
    if (!res.ok) {
      throw new Error(`Stripe checkout session failed (${res.status}): ${await res.text()}`);
    }
    const session = (await res.json()) as { id: string; url: string | null };

    return {
      providerRef: session.id,
      redirectUrl: session.url,
      instructions:
        `Pay the deposit by card on the secure Stripe page. ` +
        `Quote ${booking.reference ?? 'your booking reference'} if you contact us.`,
      // Creating a session moves no money. Only the webhook may say otherwise.
      settled: false,
    };
  }

  parseWebhook(rawBody: string, headers: Record<string, string | undefined>): WebhookEvent | null {
    this.verifySignature(rawBody, headers['stripe-signature']);

    const event = JSON.parse(rawBody) as {
      type: string;
      data: { object: { id: string; payment_status?: string } };
    };

    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        // 'completed' fires even for delayed payment methods that later fail;
        // only a session Stripe calls paid may hold the deposit.
        return event.data.object.payment_status === 'paid'
          ? { providerRef: event.data.object.id, status: 'held' }
          : null;
      case 'checkout.session.expired':
      case 'checkout.session.async_payment_failed':
        return { providerRef: event.data.object.id, status: 'failed' };
      default:
        // Verified but not ours to act on (Stripe sends many event types).
        // Refunds stay an explicit admin action for now.
        return null;
    }
  }

  /** Stripe signature scheme: HMAC-SHA256 of `${t}.${rawBody}`, hex, in v1=. */
  private verifySignature(rawBody: string, header: string | undefined): void {
    if (!header) throw new Error('Missing stripe-signature header');

    const parts = header.split(',').map((p) => p.trim());
    const t = Number(parts.find((p) => p.startsWith('t='))?.slice(2));
    const signatures = parts.filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
    if (!t || signatures.length === 0) {
      throw new Error('Malformed stripe-signature header');
    }

    const nowSeconds = (this.opts.nowMs ?? Date.now)() / 1000;
    if (Math.abs(nowSeconds - t) > StripeCardProvider.TOLERANCE_SECONDS) {
      throw new Error('Webhook timestamp outside tolerance — possible replay');
    }

    const expected = createHmac('sha256', this.opts.webhookSecret)
      .update(`${t}.${rawBody}`)
      .digest('hex');
    const expectedBuf = Buffer.from(expected);
    const valid = signatures.some((sig) => {
      const sigBuf = Buffer.from(sig);
      return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
    });
    if (!valid) throw new Error('Webhook signature verification failed');
  }
}
