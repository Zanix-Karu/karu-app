import { describe, expect, it } from 'vitest';
import { BOOKING_TRANSITIONS, canTransitionBooking } from '@karu/shared';
import type { BookingStatus } from '@karu/shared';

/**
 * Tests for the shared booking state machine (@karu/shared). The API enforces
 * every status change through this map, so its shape is a contract.
 */
describe('booking state machine', () => {
  it('matches the agreed lifecycle exactly', () => {
    expect(BOOKING_TRANSITIONS).toEqual({
      requested: ['confirmed', 'rejected', 'cancelled'],
      confirmed: ['in_progress', 'cancelled'],
      in_progress: ['completed'],
      completed: [],
      rejected: [],
      cancelled: [],
    });
  });

  it('terminal states allow no exits', () => {
    for (const terminal of ['completed', 'rejected', 'cancelled'] as BookingStatus[]) {
      for (const target of Object.keys(BOOKING_TRANSITIONS) as BookingStatus[]) {
        expect(canTransitionBooking(terminal, target)).toBe(false);
      }
    }
  });

  it('no state can transition to itself', () => {
    for (const s of Object.keys(BOOKING_TRANSITIONS) as BookingStatus[]) {
      expect(canTransitionBooking(s, s)).toBe(false);
    }
  });

  it('the happy path runs end to end', () => {
    expect(canTransitionBooking('requested', 'confirmed')).toBe(true);
    expect(canTransitionBooking('confirmed', 'in_progress')).toBe(true);
    expect(canTransitionBooking('in_progress', 'completed')).toBe(true);
  });
});
