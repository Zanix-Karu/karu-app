import { describe, expect, it } from 'vitest';
import { redactContactDetails } from './redact';

describe('redactContactDetails — the contact-isolation guardrail', () => {
  it('removes email addresses', () => {
    const r = redactContactDetails('Write to me at jean.mbarga@gmail.com for details');
    expect(r.redacted).toBe(true);
    expect(r.text).not.toContain('gmail.com');
    expect(r.text).toContain('[hidden — contact stays on Karu]');
  });

  it('removes a Cameroon mobile number, spaced or not', () => {
    for (const input of ['Call 677123456', 'Call 677 12 34 56', 'Call +237 6 77 12 34 56']) {
      const r = redactContactDetails(input);
      expect(r.redacted, input).toBe(true);
      expect(r.text, input).not.toMatch(/\d{4}/);
    }
  });

  it('removes a UK number with separators', () => {
    const r = redactContactDetails('WhatsApp me on +44 7911 123-456');
    expect(r.redacted).toBe(true);
    expect(r.text).not.toContain('7911');
  });

  it('removes wa.me and t.me links', () => {
    const r = redactContactDetails('reach me on https://wa.me/237677123456 anytime');
    expect(r.redacted).toBe(true);
    expect(r.text).not.toContain('wa.me');
  });

  it('leaves ordinary rental talk alone — prices, dates, times', () => {
    const r = redactContactDetails(
      'The total is 165000 XAF for 3 days, pick-up 09:30 on 2026-08-15 at the airport.',
    );
    expect(r.redacted).toBe(false);
    expect(r.text).toContain('165000 XAF');
  });

  it('leaves a date range alone', () => {
    const r = redactContactDetails('Available from 2026-08-15 - 2026-08-20, or 15/08/2026 if you prefer');
    expect(r.redacted).toBe(false);
  });

  it('leaves short digit runs alone', () => {
    const r = redactContactDetails('Flight AF 0952, terminal 1');
    expect(r.redacted).toBe(false);
  });

  it('reports redacted=false when nothing matched', () => {
    const r = redactContactDetails('Can we move the pick-up to 10am?');
    expect(r).toEqual({ text: 'Can we move the pick-up to 10am?', redacted: false });
  });
});
