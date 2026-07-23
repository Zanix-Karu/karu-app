import { describe, expect, it } from 'vitest';
import { computeDepositXaf, DEPOSIT_RATE } from '@karu/shared';
import { renderBookingEmail, type BookingEmailVars } from './templates';

const vars: BookingEmailVars = {
  reference: 'KARU-20260801-0001',
  carName: 'Toyota RAV4 2021',
  startDate: '2026-08-01',
  endDate: '2026-08-03',
  totalXaf: 165000,
  depositXaf: 24750,
  pickupLocation: 'Douala International Airport',
};

describe('booking email templates', () => {
  it('renders every template in both locales with the reference in the subject', () => {
    const templates = [
      'booking_requested_customer',
      'booking_requested_vendor',
      'booking_confirmed',
      'booking_rejected',
      'booking_cancelled',
    ] as const;
    for (const template of templates) {
      for (const locale of ['en', 'fr'] as const) {
        const { subject, body } = renderBookingEmail(template, locale, vars);
        expect(subject).toContain(vars.reference);
        expect(body).toContain(vars.carName);
        expect(body).toContain(vars.startDate);
      }
    }
  });

  it('localises: FR mentions Référence, EN mentions reference', () => {
    expect(renderBookingEmail('booking_confirmed', 'fr', vars).body).toContain('Référence');
    expect(renderBookingEmail('booking_confirmed', 'en', vars).body).toContain(
      'Booking reference',
    );
  });

  it('omits the deposit line when no deposit is set', () => {
    const noDeposit = { ...vars, depositXaf: null };
    expect(renderBookingEmail('booking_confirmed', 'en', noDeposit).body).not.toContain(
      'Deposit',
    );
    expect(renderBookingEmail('booking_confirmed', 'en', vars).body).toContain('Deposit');
  });

  it('falls back gracefully when no pickup location was chosen', () => {
    const noPickup = { ...vars, pickupLocation: null };
    expect(renderBookingEmail('booking_confirmed', 'en', noPickup).body).toContain(
      'to be arranged',
    );
    expect(renderBookingEmail('booking_confirmed', 'fr', noPickup).body).toContain(
      'à convenir',
    );
  });
});

describe('deposit maths (shared contract)', () => {
  it('is 15% rounded up to a whole XAF', () => {
    expect(DEPOSIT_RATE).toBe(0.15);
    expect(computeDepositXaf(100000)).toBe(15000);
    expect(computeDepositXaf(75001)).toBe(11251); // 11250.15 → ceil
  });
});
