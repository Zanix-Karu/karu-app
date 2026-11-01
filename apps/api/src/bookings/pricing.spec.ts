import { describe, expect, it } from 'vitest';
import { quoteBooking, seasonForDate, validPriceSeasons, vehicleRentalCost } from '@karu/shared';

describe('vehicleRentalCost (daily / weekly / monthly tiers)', () => {
  it('charges plain daily x days when no longer-term rates are set', () => {
    expect(vehicleRentalCost(5, 10000)).toBe(50000);
    expect(vehicleRentalCost(5, 10000, null, null)).toBe(50000);
  });

  it('decomposes greedily: months, then weeks, then days', () => {
    // 38 days = 1 month + 1 week + 1 day
    expect(vehicleRentalCost(38, 10000, 60000, 250000)).toBe(250000 + 60000 + 10000);
  });

  it('uses the weekly rate when only weekly is set', () => {
    // 10 days = 1 week + 3 days
    expect(vehicleRentalCost(10, 10000, 60000)).toBe(60000 + 30000);
  });

  it('never charges more than plain daily — a bad weekly rate cannot overcharge', () => {
    // Weekly set higher than 7 dailies: 7 days at daily = 70000 beats 80000.
    expect(vehicleRentalCost(7, 10000, 80000)).toBe(70000);
  });

  it('flows through quoteBooking', () => {
    const quote = quoteBooking({
      startDate: '2026-08-01',
      endDate: '2026-08-07', // 7 inclusive days
      dailyRateXaf: 10000,
      weeklyRateXaf: 60000,
      withDriver: false,
      driverDailyRateXaf: null,
      deliveryType: 'pickup_point',
      deliveryFeeXaf: null,
      airportFeeXaf: null,
    });
    expect(quote.vehicleXaf).toBe(60000);
    expect(quote.totalXaf).toBe(60000);
  });
});

describe('seasonal prices (0037)', () => {
  const christmas = { label: 'Christmas', from: '12-15', to: '01-05', percent: 20 };
  const base = {
    dailyRateXaf: 10_000,
    withDriver: false,
    driverDailyRateXaf: null,
    deliveryType: 'pickup_point' as const,
    deliveryFeeXaf: null,
    airportFeeXaf: null,
  };

  it('adds the percentage on days inside a range that wraps New Year', () => {
    const q = quoteBooking({ ...base, startDate: '2026-12-30', endDate: '2027-01-02', priceSeasons: [christmas] });
    expect(q.days).toBe(4);
    expect(q.seasonAdjustmentXaf).toBe(8_000);
    expect(q.vehicleXaf).toBe(48_000);
    expect(q.totalXaf).toBe(48_000);
  });

  it('only charges the days that fall inside the range', () => {
    const q = quoteBooking({ ...base, startDate: '2026-12-13', endDate: '2026-12-16', priceSeasons: [christmas] });
    expect(q.seasonAdjustmentXaf).toBe(4_000); // 15 and 16 Dec
  });

  it('leaves prices alone with no seasons, or outside them', () => {
    expect(quoteBooking({ ...base, startDate: '2026-03-01', endDate: '2026-03-03' }).seasonAdjustmentXaf).toBe(0);
    expect(
      quoteBooking({ ...base, startDate: '2026-03-01', endDate: '2026-03-03', priceSeasons: [christmas] }).totalXaf,
    ).toBe(30_000);
  });

  it('lets the biggest change win where ranges overlap', () => {
    const july = { label: 'July', from: '07-01', to: '08-31', percent: 15 };
    const festival = { label: 'Festival', from: '07-10', to: '07-12', percent: 40 };
    expect(seasonForDate([july, festival], '2026-07-11')?.label).toBe('Festival');
    expect(seasonForDate([july, festival], '2026-07-20')?.label).toBe('July');
  });

  it('supports discounts and never goes below zero', () => {
    const quiet = { label: 'Rainy', from: '01-01', to: '12-31', percent: -50 };
    const q = quoteBooking({ ...base, startDate: '2026-03-01', endDate: '2026-03-02', priceSeasons: [quiet] });
    expect(q.totalXaf).toBe(10_000);
  });

  it('rejects malformed seasons', () => {
    expect(validPriceSeasons([christmas])).toBe(true);
    expect(validPriceSeasons([{ ...christmas, from: '13-01' }])).toBe(false);
    expect(validPriceSeasons([{ ...christmas, percent: 0 }])).toBe(false);
    expect(validPriceSeasons([{ ...christmas, percent: 150 }])).toBe(false);
    expect(validPriceSeasons([{ ...christmas, label: ' ' }])).toBe(false);
  });
});
