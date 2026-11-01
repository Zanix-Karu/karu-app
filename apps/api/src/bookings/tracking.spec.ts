import { describe, expect, it } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Booking } from '@karu/shared';
import { TrackingService } from './tracking.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { BookingsService } from './bookings.service';

const base = {
  id: 'b1',
  vehicle_id: 'v1',
  status: 'confirmed',
  with_driver: false,
  delivery_type: 'address',
  delivery_lat: 4.0897,
  delivery_lng: 9.7426,
  tracking_started_at: '2026-08-01T08:00:00Z',
  tracking_ended_at: null,
  tracking_lat: 4.0511,
  tracking_lng: 9.7085,
  tracking_updated_at: new Date().toISOString(),
} as unknown as Booking;

const make = (booking: Record<string, unknown>) => {
  const patches: Array<Record<string, unknown>> = [];
  const db = {
    from: () => ({
      update: (p: Record<string, unknown>) => {
        patches.push(p);
        return { eq: async () => ({ error: null }) };
      },
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { city: 'douala' } }) }) }),
    }),
  };
  const bookings = { getForUser: async () => booking } as unknown as BookingsService;
  return { svc: new TrackingService({ db } as unknown as SupabaseService, bookings), patches };
};

describe('TrackingService (0035)', () => {
  it('gives the customer a distance and a rough ETA to their pin', async () => {
    const { svc } = make(base as never);
    const s = await svc.state('b1', 'cust-1', 'customer');
    expect(s.active).toBe(true);
    if (!s.active) return;
    expect(s.distance_km).toBeGreaterThan(5);
    expect(s.eta_minutes).toBeGreaterThan(10);
    expect(s.stale).toBe(false);
  });

  it('heads for the airport on an airport meet', async () => {
    const { svc } = make({ ...base, delivery_type: 'airport', delivery_lat: null, delivery_lng: null } as never);
    const s = await svc.state('b1', 'cust-1', 'customer');
    expect(s.active && s.destination).toEqual({ lat: 4.0061, lng: 9.7195 });
  });

  it('is off once the car is handed over', async () => {
    const { svc } = make({ ...base, status: 'in_progress' } as never);
    expect((await svc.state('b1', 'cust-1', 'customer')).active).toBe(false);
  });

  it('only the provider can share a position', async () => {
    const { svc } = make(base as never);
    await expect(svc.update('b1', 'cust-1', 'customer', { lat: 4, lng: 9 })).rejects.toThrow(ForbiddenException);
  });

  it('refuses to track a car the customer is collecting themselves', async () => {
    const { svc } = make({ ...base, delivery_type: 'pickup_point' } as never);
    await expect(svc.start('b1', 'vend-profile', 'vendor')).rejects.toThrow(BadRequestException);
  });

  it('stopping wipes the last position', async () => {
    const { svc, patches } = make(base as never);
    await svc.stop('b1', 'vend-profile', 'vendor');
    expect(patches[0]).toMatchObject({ tracking_lat: null, tracking_lng: null });
    expect(patches[0].tracking_ended_at).toBeDefined();
  });
});
