import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { Booking } from '@karu/shared';
import { computeDepositXaf } from '@karu/shared';
import { ManualPaymentProvider, StripeCardProvider } from './provider';

const booking = {
  id: 'b1',
  reference: 'KARU-20260803-0001',
  total_xaf: 165000,
  deposit_xaf: 24750,
} as Booking;

describe('ManualPaymentProvider — the placeholder that ships today', () => {
  const provider = new ManualPaymentProvider();

  it('cannot charge, and says so', () => {
    expect(provider.canCharge).toBe(false);
  });

  it('NEVER reports a deposit as settled — no screen may claim money moved', async () => {
    const intent = await provider.createDepositIntent({
      booking,
      amountXaf: 24750,
      paymentId: 'p1',
    });
    expect(intent.settled).toBe(false);
  });

  it('gives the customer their reference and states nothing was charged', async () => {
    const intent = await provider.createDepositIntent({
      booking,
      amountXaf: 24750,
      paymentId: 'p1',
    });
    expect(intent.instructions).toContain('KARU-20260803-0001');
    expect(intent.instructions).toContain('Nothing has been charged');
  });

  it('offers no redirect, because there is nowhere to pay yet', async () => {
    const intent = await provider.createDepositIntent({
      booking,
      amountXaf: 24750,
      paymentId: 'p1',
    });
    expect(intent.redirectUrl).toBeNull();
  });

  it('refuses webhooks outright — an unsigned callback must never mark money received', () => {
    expect(() => provider.parseWebhook()).toThrow(/no payment provider is configured/i);
  });
});

describe('deposit amount', () => {
  it('matches the shared 15% rule the UI displays', () => {
    expect(computeDepositXaf(165000)).toBe(24750);
    expect(booking.deposit_xaf).toBe(computeDepositXaf(booking.total_xaf));
  });
});

// --- Stripe card deposits ----------------------------------------------------

const NOW_MS = 1_754_000_000_000;

function stripeProvider(fetchFn: typeof fetch) {
  return new StripeCardProvider({
    secretKey: 'sk_test_x',
    webhookSecret: 'whsec_test',
    webAppUrl: 'https://app.getkaru.io/',
    fetchFn,
    nowMs: () => NOW_MS,
  });
}

/** A correctly signed webhook payload, the way Stripe signs them. */
function signed(payload: string, opts: { secret?: string; ageSeconds?: number } = {}) {
  const t = Math.floor(NOW_MS / 1000) - (opts.ageSeconds ?? 0);
  const sig = createHmac('sha256', opts.secret ?? 'whsec_test')
    .update(`${t}.${payload}`)
    .digest('hex');
  return { 'stripe-signature': `t=${t},v1=${sig}` };
}

const sessionJson = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_123', payment_status: 'paid', ...over } },
  });

describe('StripeCardProvider — card deposits for the diaspora', () => {
  it('creates a Checkout session and hands back its redirect', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'cs_123', url: 'https://checkout.stripe.com/pay/cs_123' })),
    );
    const intent = await stripeProvider(fetchFn as typeof fetch).createDepositIntent({
      booking,
      amountXaf: 24750,
      paymentId: 'p1',
    });

    expect(intent.providerRef).toBe('cs_123');
    expect(intent.redirectUrl).toBe('https://checkout.stripe.com/pay/cs_123');

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.stripe.com/v1/checkout/sessions');
    // Same idempotency key per payment row — a double-click cannot double-charge.
    expect(init.headers['Idempotency-Key']).toBe('karu-deposit-p1');
    const body = new URLSearchParams(init.body as string);
    // XAF is zero-decimal: 24750 must go through unscaled.
    expect(body.get('line_items[0][price_data][unit_amount]')).toBe('24750');
    expect(body.get('line_items[0][price_data][currency]')).toBe('xaf');
    expect(body.get('success_url')).toBe('https://app.getkaru.io/bookings/b1?deposit=success');
  });

  it('NEVER reports settled from session creation — only the webhook moves money truth', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'cs_1', url: 'u' })));
    const intent = await stripeProvider(fetchFn as typeof fetch).createDepositIntent({
      booking,
      amountXaf: 24750,
      paymentId: 'p1',
    });
    expect(intent.settled).toBe(false);
  });

  it('marks a paid, completed session as held', () => {
    const payload = sessionJson();
    const event = stripeProvider(fetch).parseWebhook(payload, signed(payload));
    expect(event).toEqual({ providerRef: 'cs_123', status: 'held' });
  });

  it('does NOT hold the deposit for a completed-but-unpaid session', () => {
    const payload = sessionJson({ payment_status: 'unpaid' });
    expect(stripeProvider(fetch).parseWebhook(payload, signed(payload))).toBeNull();
  });

  it('maps an expired session to failed', () => {
    const payload = JSON.stringify({
      type: 'checkout.session.expired',
      data: { object: { id: 'cs_dead' } },
    });
    expect(stripeProvider(fetch).parseWebhook(payload, signed(payload))).toEqual({
      providerRef: 'cs_dead',
      status: 'failed',
    });
  });

  it('acknowledges unrelated event types without touching anything', () => {
    const payload = JSON.stringify({ type: 'customer.created', data: { object: { id: 'cus_1' } } });
    expect(stripeProvider(fetch).parseWebhook(payload, signed(payload))).toBeNull();
  });

  it('refuses a bad signature — an unverified webhook must never mark money received', () => {
    const payload = sessionJson();
    expect(() =>
      stripeProvider(fetch).parseWebhook(payload, signed(payload, { secret: 'whsec_wrong' })),
    ).toThrow(/signature verification failed/i);
  });

  it('refuses a missing signature header', () => {
    expect(() => stripeProvider(fetch).parseWebhook(sessionJson(), {})).toThrow(
      /missing stripe-signature/i,
    );
  });

  it('refuses a stale timestamp — replayed webhooks are not honoured', () => {
    const payload = sessionJson();
    expect(() =>
      stripeProvider(fetch).parseWebhook(payload, signed(payload, { ageSeconds: 600 })),
    ).toThrow(/replay/i);
  });
});
