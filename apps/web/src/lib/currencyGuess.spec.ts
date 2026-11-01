import { describe, expect, it } from 'vitest';
import { guessCurrency } from './currencyGuess';

describe('guessCurrency', () => {
  it('uses the region of the first language that has one', () => {
    expect(guessCurrency(['en-GB', 'en'])).toBe('GBP');
    expect(guessCurrency(['fr-FR'])).toBe('EUR');
    expect(guessCurrency(['de-DE', 'en-GB'])).toBe('EUR');
  });
  it('keeps Cameroon on XAF', () => {
    expect(guessCurrency(['fr-CM'], 'Europe/Paris')).toBe('XAF');
  });
  it('falls back to the time zone for bare languages', () => {
    expect(guessCurrency(['en'], 'Europe/London')).toBe('GBP');
    expect(guessCurrency(['fr'], 'Europe/Paris')).toBe('EUR');
  });
  it('stays on XAF when it cannot tell', () => {
    expect(guessCurrency(['en-US'], 'America/New_York')).toBe('XAF');
    expect(guessCurrency(['en'], 'Africa/Douala')).toBe('XAF');
    expect(guessCurrency([])).toBe('XAF');
  });
});
