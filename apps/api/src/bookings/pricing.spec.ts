import { describe, expect, it } from 'vitest';
import { quoteBooking, vehicleRentalCost } from '@karu/shared';

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
