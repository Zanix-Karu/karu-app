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
   * received.
   */
  parseWebhook(rawBody: string, headers: Record<string, string | undefined>): WebhookEvent;
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
