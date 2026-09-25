import { describe, expect, it } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { isBookingArchived, type Booking } from '@karu/shared';
import { BookingsService } from './bookings.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { VehiclesService } from '../vehicles/vehicles.service';
import type { VendorsService } from '../vendors/vendors.service';
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
  with_driver: false,
  driver_fee_xaf: 0,
  delivery_type: 'pickup_point',
  delivery_address: null,
  delivery_fee_xaf: 0,
  pickup_time: null,
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
  assistance_requested_at: null,
  assistance_requested_by: null,
  assistance_note: null,
  assistance_resolved_at: null,
};

const noVehicles = {} as VehiclesService;
// The transition path never prices anything, so no vendor lookup happens here.
const noVendors = {} as VendorsService;

describe('BookingsService.transition — state machine', () => {
  it('vendor confirms a requested booking and confirmed_at is stamped', async () => {
    const { service: supabase, state } = makeSupabase(baseBooking, { vendorId: 'vend-1' });
    const svc = new BookingsService(supabase, noVehicles, noVendors, noNotifications);
    const result = await svc.transition('b1', 'vendor-profile', 'vendor', 'confirmed');
    expect(result.status).toBe('confirmed');
    expect(state.updated?.confirmed_at).toBeDefined();
  });

  it('rejects an illegal jump (requested → completed)', async () => {
    const { service: supabase } = makeSupabase(baseBooking, { vendorId: 'vend-1' });
    const svc = new BookingsService(supabase, noVehicles, noVendors, noNotifications);
    await expect(
      svc.transition('b1', 'vendor-profile', 'vendor', 'completed'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects transitions out of a terminal state', async () => {
    const { service: supabase } = makeSupabase(
      { ...baseBooking, status: 'completed' },
      { vendorId: 'vend-1' },
    );
    const svc = new BookingsService(supabase, noVehicles, noVendors, noNotifications);
    await expect(
      svc.transition('b1', 'vendor-profile', 'vendor', 'cancelled'),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('BookingsService.transition — role permissions', () => {
  it('a customer may cancel their own booking', async () => {
    const { service: supabase } = makeSupabase(baseBooking);
    const svc = new BookingsService(supabase, noVehicles, noVendors, noNotifications);
    const result = await svc.transition('b1', 'cust-1', 'customer', 'cancelled');
    expect(result.status).toBe('cancelled');
  });

  it('a customer may NOT confirm a booking', async () => {
    const { service: supabase } = makeSupabase(baseBooking);
    const svc = new BookingsService(supabase, noVehicles, noVendors, noNotifications);
    await expect(svc.transition('b1', 'cust-1', 'customer', 'confirmed')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("a customer may NOT touch someone else's booking", async () => {
    const { service: supabase } = makeSupabase(baseBooking);
    const svc = new BookingsService(supabase, noVehicles, noVendors, noNotifications);
    await expect(
      svc.transition('b1', 'other-customer', 'customer', 'cancelled'),
    ).rejects.toThrow(ForbiddenException);
  });

  it("a vendor may NOT drive another vendor's booking", async () => {
    const { service: supabase } = makeSupabase(baseBooking, { vendorId: 'other-vendor' });
    const svc = new BookingsService(supabase, noVehicles, noVendors, noNotifications);
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
    driver_option: 'none',
    driver_daily_rate_xaf: null,
  };

  /** A provider offering both a driver-capable fleet and delivery. */
  const fullServiceVendor = {
    id: 'vend-1',
    status: 'verified',
    delivery_fee_xaf: 5000,
    airport_fee_xaf: 10000,
  };

  // Future-proof test dates: always next year.
  const nextYear = new Date().getUTCFullYear() + 1;
  const d = (day: string) => `${nextYear}-08-${day}`;

  const makeSvc = (
    v: Record<string, unknown>,
    available = true,
    vendorRow: Record<string, unknown> = fullServiceVendor,
  ) => {
    const { service: supabase } = makeSupabase(baseBooking);
    const vehicles = {
      getById: async () => v,
      availability: async () => ({ available, conflicts: [] }),
    } as unknown as VehiclesService;
    const vendors = { getById: async () => vendorRow } as unknown as VendorsService;
    return new BookingsService(supabase, vehicles, vendors, noNotifications);
  };

  it("refuses to book an unverified provider's car (verification is a gate)", async () => {
    const svc = makeSvc(vehicle, true, { ...fullServiceVendor, status: 'pending' });
    await expect(
      svc.create('cust-1', {
        vehicle_id: 'v1',
        start_date: d('01'),
        end_date: d('03'),
      } as never),
    ).rejects.toThrow(/not yet verified/);
  });

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

  // ---- Driver and delivery ------------------------------------------------

  const withDriver = { ...vehicle, driver_option: 'optional', driver_daily_rate_xaf: 20000 };

  it('a chauffeur-driven rental charges the driver for every day', async () => {
    const svc = makeSvc(withDriver);
    const result = await svc.create('cust-1', {
      vehicle_id: 'v1',
      start_date: d('01'),
      end_date: d('03'),
      with_driver: true,
    } as never);
    expect(result.driver_fee_xaf).toBe(20000 * 3);
    expect(result.total_xaf).toBe((25000 + 20000) * 3);
    // The deposit follows the real total, not the vehicle line alone.
    expect(result.deposit_xaf).toBe(Math.ceil((25000 + 20000) * 3 * 0.15));
  });

  it('an airport pickup adds the airport fee once, not per day', async () => {
    const svc = makeSvc(vehicle);
    const result = await svc.create('cust-1', {
      vehicle_id: 'v1',
      start_date: d('01'),
      end_date: d('05'),
      delivery_type: 'airport',
      pickup_time: '14:20',
    } as never);
    expect(result.delivery_fee_xaf).toBe(10000);
    expect(result.total_xaf).toBe(25000 * 5 + 10000);
    expect(result.pickup_time).toBe('14:20');
  });

  it('refuses a driver on a car that does not offer one', async () => {
    const svc = makeSvc(vehicle);
    await expect(
      svc.create('cust-1', {
        vehicle_id: 'v1',
        start_date: d('01'),
        end_date: d('03'),
        with_driver: true,
      } as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses self-drive on a car that is driver-only', async () => {
    const svc = makeSvc({ ...withDriver, driver_option: 'required' });
    await expect(
      svc.create('cust-1', {
        vehicle_id: 'v1',
        start_date: d('01'),
        end_date: d('03'),
        with_driver: false,
      } as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('defaults a driver-only car to with_driver rather than mispricing it', async () => {
    const svc = makeSvc({ ...withDriver, driver_option: 'required' });
    const result = await svc.create('cust-1', {
      vehicle_id: 'v1',
      start_date: d('01'),
      end_date: d('02'),
    } as never);
    expect(result.with_driver).toBe(true);
    expect(result.total_xaf).toBe((25000 + 20000) * 2);
  });

  it('refuses airport pickup from a provider that does not offer it', async () => {
    const svc = makeSvc(vehicle, true, {
      id: 'vend-1',
      status: 'verified',
      delivery_fee_xaf: 5000,
      airport_fee_xaf: null,
    });
    await expect(
      svc.create('cust-1', {
        vehicle_id: 'v1',
        start_date: d('01'),
        end_date: d('03'),
        delivery_type: 'airport',
      } as never),
    ).rejects.toThrow(/airport/);
  });

  it('refuses address delivery with no address', async () => {
    const svc = makeSvc(vehicle);
    await expect(
      svc.create('cust-1', {
        vehicle_id: 'v1',
        start_date: d('01'),
        end_date: d('03'),
        delivery_type: 'address',
        delivery_address: '   ',
      } as never),
    ).rejects.toThrow(BadRequestException);
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

describe('isBookingArchived (REQ-10)', () => {
  it('is true only for the three terminal statuses', () => {
    expect(isBookingArchived('completed')).toBe(true);
    expect(isBookingArchived('rejected')).toBe(true);
    expect(isBookingArchived('cancelled')).toBe(true);
  });

  it('is false for statuses still in play', () => {
    expect(isBookingArchived('requested')).toBe(false);
    expect(isBookingArchived('confirmed')).toBe(false);
    expect(isBookingArchived('in_progress')).toBe(false);
  });
});
