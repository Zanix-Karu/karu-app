import { describe, expect, it } from 'vitest';
import type { Booking } from '@karu/shared';
import { computeDepositXaf } from '@karu/shared';
import { ManualPaymentProvider } from './provider';

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
