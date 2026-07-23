import { describe, expect, it } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import type { Booking } from '@karu/shared';
import { BookingsService } from './bookings.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { VehiclesService } from '../vehicles/vehicles.service';
import type { NotificationsService } from '../notifications/notifications.service';

/** Minimal chainable stub of the supabase-js query builder for these tests. */
const makeSupabase = (booking: Booking, opts: { vendorId?: string } = {}) => {
  const state = { updated: undefined as Record<string, unknown> | undefined };
  const db = {
    rpc: async (fn: string) => {
      if (fn === 'next_booking_reference') {
        return { data: 'KARU-20260801-0001', error: null };
      }
      throw new Error(`Unexpected rpc: ${fn}`);
    },
    from: (table: string) => {
      if (table === 'bookings') {
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: booking, error: null }) }),
          }),
          update: (patch: Record<string, unknown>) => {
            state.updated = patch;
            return {
              eq: () => ({
                select: () => ({
                  single: async () => ({ data: { ...booking, ...patch }, error: null }),
                }),
              }),
            };
          },
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: async () => ({ data: { id: 'new-booking', ...row }, error: null }),
            }),
          }),
        };
      }
      if (table === 'vendors') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: opts.vendorId ? { id: opts.vendorId } : null,
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
  return { service: { db } as unknown as SupabaseService, state };
};

const noNotifications = {
  notifyBookingEvent: async () => undefined,
} as unknown as NotificationsService;

const baseBooking: Booking = {
  id: 'b1',
  vehicle_id: 'v1',
  customer_id: 'cust-1',
  vendor_id: 'vend-1',
  start_date: '2026-08-01',
  end_date: '2026-08-03',
  pickup_location: null,
  status: 'requested',
  daily_rate_xaf: 25000,
  total_xaf: 75000,
  deposit_xaf: null,
  reference: null,
  currency: 'XAF',
  customer_note: null,
  vendor_note: null,
  requested_at: '2026-07-19T00:00:00Z',
  confirmed_at: null,
  created_at: '2026-07-19T00:00:00Z',
  updated_at: '2026-07-19T00:00:00Z',
};

const noVehicles = {} as VehiclesService;

describe('BookingsService.transition — state machine', () => {
  it('vendor confirms a requested booking and confirmed_at is stamped', async () => {
    const { service: supabase, state } = makeSupabase(baseBooking, { vendorId: 'vend-1' });
    const svc = new BookingsService(supabase, noVehicles, noNotifications);
    const result = await svc.transition('b1', 'vendor-profile', 'vendor', 'confirmed');
    expect(result.status).toBe('confirmed');
    expect(state.updated?.confirmed_at).toBeDefined();
  });

  it('rejects an illegal jump (requested → completed)', async () => {
    const { service: supabase } = makeSupabase(baseBooking, { vendorId: 'vend-1' });
    const svc = new BookingsService(supabase, noVehicles, noNotifications);
    await expect(
      svc.transition('b1', 'vendor-profile', 'vendor', 'completed'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects transitions out of a terminal state', async () => {
    const { service: supabase } = makeSupabase(
      { ...baseBooking, status: 'completed' },
      { vendorId: 'vend-1' },
    );
    const svc = new BookingsService(supabase, noVehicles, noNotifications);
    await expect(
      svc.transition('b1', 'vendor-profile', 'vendor', 'cancelled'),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('BookingsService.transition — role permissions', () => {
  it('a customer may cancel their own booking', async () => {
    const { service: supabase } = makeSupabase(baseBooking);
    const svc = new BookingsService(supabase, noVehicles, noNotifications);
    const result = await svc.transition('b1', 'cust-1', 'customer', 'cancelled');
    expect(result.status).toBe('cancelled');
  });

  it('a customer may NOT confirm a booking', async () => {
    const { service: supabase } = makeSupabase(baseBooking);
    const svc = new BookingsService(supabase, noVehicles, noNotifications);
    await expect(svc.transition('b1', 'cust-1', 'customer', 'confirmed')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("a customer may NOT touch someone else's booking", async () => {
    const { service: supabase } = makeSupabase(baseBooking);
    const svc = new BookingsService(supabase, noVehicles, noNotifications);
    await expect(
      svc.transition('b1', 'other-customer', 'customer', 'cancelled'),
    ).rejects.toThrow(ForbiddenException);
  });

  it("a vendor may NOT drive another vendor's booking", async () => {
    const { service: supabase } = makeSupabase(baseBooking, { vendorId: 'other-vendor' });
    const svc = new BookingsService(supabase, noVehicles, noNotifications);
    await expect(
      svc.transition('b1', 'vendor-profile', 'vendor', 'confirmed'),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('BookingsService.create — booking request flow', () => {
  const vehicle = {
    id: 'v1',
    vendor_id: 'vend-1',
    status: 'active',
    daily_rate_xaf: 25000,
  };

  // Future-proof test dates: always next year.
  const nextYear = new Date().getUTCFullYear() + 1;
  const d = (day: string) => `${nextYear}-08-${day}`;

  const makeSvc = (v: Record<string, unknown>, available = true) => {
    const { service: supabase } = makeSupabase(baseBooking);
    const vehicles = {
      getById: async () => v,
      availability: async () => ({ available, conflicts: [] }),
    } as unknown as VehiclesService;
    return new BookingsService(supabase, vehicles, noNotifications);
  };

  it('computes total, 15% deposit, and mints a reference server-side', async () => {
    const svc = makeSvc(vehicle);
    const result = await svc.create('cust-1', {
      vehicle_id: 'v1',
      start_date: d('01'),
      end_date: d('03'),
    } as never);
    expect(result.total_xaf).toBe(25000 * 3);
    expect(result.deposit_xaf).toBe(Math.ceil(25000 * 3 * 0.15));
    expect(result.reference).toBe('KARU-20260801-0001');
  });

  it('a same-day rental is one day, never zero', async () => {
    const svc = makeSvc(vehicle);
    const result = await svc.create('cust-1', {
      vehicle_id: 'v1',
      start_date: d('01'),
      end_date: d('01'),
    } as never);
    expect(result.total_xaf).toBe(25000);
  });

  it('409s when the window is already booked or blocked', async () => {
    const svc = makeSvc(vehicle, false);
    await expect(
      svc.create('cust-1', {
        vehicle_id: 'v1',
        start_date: d('01'),
        end_date: d('03'),
      } as never),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects a start date in the past', async () => {
    const svc = makeSvc(vehicle);
    await expect(
      svc.create('cust-1', {
        vehicle_id: 'v1',
        start_date: '2020-01-01',
        end_date: '2020-01-03',
      } as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects booking an inactive vehicle', async () => {
    const svc = makeSvc({ ...vehicle, status: 'draft' });
    await expect(
      svc.create('cust-1', {
        vehicle_id: 'v1',
        start_date: d('01'),
        end_date: d('03'),
      } as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an inverted date range', async () => {
    const svc = makeSvc(vehicle);
    await expect(
      svc.create('cust-1', {
        vehicle_id: 'v1',
        start_date: d('03'),
        end_date: d('01'),
      } as never),
    ).rejects.toThrow(BadRequestException);
  });
});
