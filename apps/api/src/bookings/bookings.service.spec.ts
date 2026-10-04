import { describe, expect, it } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { depositRefundDue, isBookingArchived, type Booking } from '@karu/shared';
import { BookingsService } from './bookings.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { VehiclesService } from '../vehicles/vehicles.service';
import type { VendorsService } from '../vendors/vendors.service';
import type { NotificationsService } from '../notifications/notifications.service';

/** A tiny chainable query stub: records .eq() filters, answers from `resolve`. */
const chain = (resolve: (filters: Record<string, unknown>) => unknown) => {
  const filters: Record<string, unknown> = {};
  const c: Record<string, unknown> = {
    select: () => c,
    eq: (k: string, v: unknown) => {
      filters[k] = v;
      return c;
    },
    maybeSingle: async () => ({ data: resolve(filters) ?? null, error: null }),
    single: async () => ({ data: resolve(filters) ?? null, error: null }),
  };
  return c;
};

interface StubOpts {
  /** The vendor the calling vendor-profile owns (getOwned). */
  vendorId?: string;
  /** Stages the vendor has recorded a condition report for. */
  inspected?: Array<'handover' | 'return'>;
  paymentStatus?: string;
  /** The listed vehicle's vendor row, for the self-booking check. */
  vendorRow?: Record<string, unknown>;
  phones?: Record<string, string | null>;
  emails?: Record<string, string | null>;
  /** The customer's ID check (0032); verified, adult and licensed by default. */
  customer?: { verification_status?: string; date_of_birth?: string | null; licence_expires_at?: string | null };
}

/** Minimal chainable stub of the supabase-js query builder for these tests. */
const makeSupabase = (booking: Booking, opts: StubOpts = {}) => {
  const inspected = opts.inspected ?? ['handover', 'return'];
  const state = {
    updated: undefined as Record<string, unknown> | undefined,
    updates: [] as Array<Record<string, unknown>>,
  };
  const db = {
    rpc: async (fn: string) => {
      if (fn === 'next_booking_reference') {
        return { data: 'KARU-20260801-0001', error: null };
      }
      throw new Error(`Unexpected rpc: ${fn}`);
    },
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: { user: opts.emails?.[id] ? { email: opts.emails[id] } : null },
        }),
      },
    },
    from: (table: string) => {
      if (table === 'bookings') {
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: booking, error: null }) }),
          }),
          update: (patch: Record<string, unknown>) => {
            state.updated = patch;
            state.updates.push(patch);
            const result = {
              select: () => ({
                single: async () => ({ data: { ...booking, ...patch }, error: null }),
              }),
              then: (ok: (v: unknown) => unknown) => ok({ data: null, error: null }),
            };
            return { eq: () => result };
          },
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: async () => ({ data: { id: 'new-booking', ...row }, error: null }),
            }),
          }),
        };
      }
      if (table === 'vendors') {
        return chain((f) => {
          if ('profile_id' in f) return opts.vendorId ? { id: opts.vendorId } : null;
          return opts.vendorRow ?? null;
        });
      }
      if (table === 'booking_inspections') {
        return chain((f) =>
          inspected.includes(f.stage as 'handover' | 'return') ? { id: `insp-${String(f.stage)}` } : null,
        );
      }
      if (table === 'payments') {
        return chain(() => (opts.paymentStatus ? { status: opts.paymentStatus } : null));
      }
      if (table === 'profiles') {
        return chain((f) => ({
          phone: opts.phones?.[f.id as string] ?? null,
          verification_status: 'verified',
          date_of_birth: '1990-01-01',
          licence_expires_at: '2099-01-01',
          ...opts.customer,
        }));
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
  handover_code: null,
  return_code: null,
  code_failed_attempts: 0,
  code_locked_at: null,
  cancelled_at: null,
  cancelled_by: null,
  cancellation_reason: null,
  deposit_refund_due: null,
  completed_at: null,
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

describe('BookingsService.transition — handover/return codes (REQ-6)', () => {
  it('mints both codes on confirm', async () => {
    const { service: supabase, state } = makeSupabase(baseBooking, { vendorId: 'vend-1' });
    const svc = new BookingsService(supabase, noVehicles, noVendors, noNotifications);
    await svc.transition('b1', 'vendor-profile', 'vendor', 'confirmed');
    expect(state.updated?.handover_code).toMatch(/^\d{4}$/);
    expect(state.updated?.return_code).toMatch(/^\d{4}$/);
  });

  it('a vendor cannot confirm handover with no code', async () => {
    const confirmedBooking = { ...baseBooking, status: 'confirmed' as const, handover_code: '1234' };
    const { service: supabase } = makeSupabase(confirmedBooking, { vendorId: 'vend-1' });
    const svc = new BookingsService(supabase, noVehicles, noVendors, noNotifications);
    await expect(
      svc.transition('b1', 'vendor-profile', 'vendor', 'in_progress'),
    ).rejects.toThrow(BadRequestException);
  });

  it('a vendor cannot confirm handover with the wrong code', async () => {
    const confirmedBooking = { ...baseBooking, status: 'confirmed' as const, handover_code: '1234' };
    const { service: supabase } = makeSupabase(confirmedBooking, { vendorId: 'vend-1' });
    const svc = new BookingsService(supabase, noVehicles, noVendors, noNotifications);
    await expect(
      svc.transition('b1', 'vendor-profile', 'vendor', 'in_progress', undefined, '0000'),
    ).rejects.toThrow(BadRequestException);
  });

  it('a vendor confirms handover with the right code', async () => {
    const confirmedBooking = { ...baseBooking, status: 'confirmed' as const, handover_code: '1234' };
    const { service: supabase } = makeSupabase(confirmedBooking, { vendorId: 'vend-1' });
    const svc = new BookingsService(supabase, noVehicles, noVendors, noNotifications);
    const result = await svc.transition('b1', 'vendor-profile', 'vendor', 'in_progress', undefined, '1234');
    expect(result.status).toBe('in_progress');
  });

  it('a vendor confirms return with the right return_code, not the handover_code', async () => {
    const inProgress = {
      ...baseBooking,
      status: 'in_progress' as const,
      handover_code: '1234',
      return_code: '5678',
    };
    const { service: supabase } = makeSupabase(inProgress, { vendorId: 'vend-1' });
    const svc = new BookingsService(supabase, noVehicles, noVendors, noNotifications);
    // The handover code (from the earlier step) must NOT also confirm the return.
    await expect(
      svc.transition('b1', 'vendor-profile', 'vendor', 'completed', undefined, '1234'),
    ).rejects.toThrow(BadRequestException);
    const result = await svc.transition('b1', 'vendor-profile', 'vendor', 'completed', undefined, '5678');
    expect(result.status).toBe('completed');
  });

  it('admin overrides the code requirement (ops/dispute escape hatch)', async () => {
    const confirmedBooking = { ...baseBooking, status: 'confirmed' as const, handover_code: '1234' };
    const { service: supabase } = makeSupabase(confirmedBooking);
    const svc = new BookingsService(supabase, noVehicles, noVendors, noNotifications);
    const result = await svc.transition('b1', 'admin-1', 'admin', 'in_progress');
    expect(result.status).toBe('in_progress');
  });

  it('hides the codes from a vendor reading the booking back, but not from the customer', async () => {
    const confirmedBooking = {
      ...baseBooking,
      status: 'confirmed' as const,
      handover_code: '1234',
      return_code: '5678',
    };
    const { service: supabase } = makeSupabase(confirmedBooking, { vendorId: 'vend-1' });
    const svc = new BookingsService(supabase, noVehicles, noVendors, noNotifications);
    const asVendor = await svc.getForUser('b1', 'vendor-profile', 'vendor');
    expect(asVendor.handover_code).toBeNull();
    expect(asVendor.return_code).toBeNull();
    const asCustomer = await svc.getForUser('b1', 'cust-1', 'customer');
    expect(asCustomer.handover_code).toBe('1234');
    expect(asCustomer.return_code).toBe('5678');
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

describe('BookingsService — safeguards (0030)', () => {
  const confirmed = { ...baseBooking, status: 'confirmed' as const, handover_code: '1234', return_code: '5678' };

  it('counts a wrong code and says how many tries are left', async () => {
    const { service: supabase, state } = makeSupabase(confirmed, { vendorId: 'vend-1' });
    const svc = new BookingsService(supabase, noVehicles, noVendors, noNotifications);
    await expect(
      svc.transition('b1', 'vendor-profile', 'vendor', 'in_progress', undefined, '0000'),
    ).rejects.toThrow(/4 tries left/);
    expect(state.updated?.code_failed_attempts).toBe(1);
    expect(state.updated?.code_locked_at).toBeUndefined();
  });

  it('locks the code on the last allowed miss and raises it with Karu support', async () => {
    const { service: supabase, state } = makeSupabase(
      { ...confirmed, code_failed_attempts: 4 },
      { vendorId: 'vend-1' },
    );
    const svc = new BookingsService(supabase, noVehicles, noVendors, noNotifications);
    await expect(
      svc.transition('b1', 'vendor-profile', 'vendor', 'in_progress', undefined, '0000'),
    ).rejects.toThrow(ForbiddenException);
    expect(state.updated?.code_locked_at).toBeDefined();
    expect(state.updated?.assistance_requested_at).toBeDefined();
  });

  it('a locked booking refuses even the right code from a vendor', async () => {
    const { service: supabase } = makeSupabase(
      { ...confirmed, code_locked_at: '2026-07-20T00:00:00Z' },
      { vendorId: 'vend-1' },
    );
    const svc = new BookingsService(supabase, noVehicles, noVendors, noNotifications);
    await expect(
      svc.transition('b1', 'vendor-profile', 'vendor', 'in_progress', undefined, '1234'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('accepts a code read back with a space in it, and resets the counter', async () => {
    const { service: supabase, state } = makeSupabase(
      { ...confirmed, code_failed_attempts: 2 },
      { vendorId: 'vend-1' },
    );
    const svc = new BookingsService(supabase, noVehicles, noVendors, noNotifications);
    const result = await svc.transition('b1', 'vendor-profile', 'vendor', 'in_progress', undefined, '12 34');
    expect(result.status).toBe('in_progress');
    expect(state.updated?.code_failed_attempts).toBe(0);
  });

  it('a self-drive handover needs the condition report first', async () => {
    const { service: supabase } = makeSupabase(confirmed, { vendorId: 'vend-1', inspected: [] });
    const svc = new BookingsService(supabase, noVehicles, noVendors, noNotifications);
    await expect(
      svc.transition('b1', 'vendor-profile', 'vendor', 'in_progress', undefined, '1234'),
    ).rejects.toThrow(/condition/);
  });

  it('a chauffeur rental needs no condition report', async () => {
    const { service: supabase } = makeSupabase(
      { ...confirmed, with_driver: true },
      { vendorId: 'vend-1', inspected: [] },
    );
    const svc = new BookingsService(supabase, noVehicles, noVendors, noNotifications);
    const result = await svc.transition('b1', 'vendor-profile', 'vendor', 'in_progress', undefined, '1234');
    expect(result.status).toBe('in_progress');
  });

  it('closing the trip needs the return report and stamps completed_at', async () => {
    const inProgress = { ...confirmed, status: 'in_progress' as const };
    const missing = makeSupabase(inProgress, { vendorId: 'vend-1', inspected: ['handover'] });
    await expect(
      new BookingsService(missing.service, noVehicles, noVendors, noNotifications).transition(
        'b1', 'vendor-profile', 'vendor', 'completed', undefined, '5678',
      ),
    ).rejects.toThrow(/condition/);

    const ok = makeSupabase(inProgress, { vendorId: 'vend-1' });
    await new BookingsService(ok.service, noVehicles, noVendors, noNotifications).transition(
      'b1', 'vendor-profile', 'vendor', 'completed', undefined, '5678',
    );
    expect(ok.state.updated?.completed_at).toBeDefined();
  });

  it('holds the handover until the deposit is in, when that is required', async () => {
    const config = { get: (k: string) => (k === 'REQUIRE_DEPOSIT_BEFORE_HANDOVER' ? 'true' : undefined) };
    const unpaid = makeSupabase(confirmed, { vendorId: 'vend-1' });
    await expect(
      new BookingsService(unpaid.service, noVehicles, noVendors, noNotifications, config as never).transition(
        'b1', 'vendor-profile', 'vendor', 'in_progress', undefined, '1234',
      ),
    ).rejects.toThrow(/deposit/);

    const paid = makeSupabase(confirmed, { vendorId: 'vend-1', paymentStatus: 'held' });
    const result = await new BookingsService(
      paid.service, noVehicles, noVendors, noNotifications, config as never,
    ).transition('b1', 'vendor-profile', 'vendor', 'in_progress', undefined, '1234');
    expect(result.status).toBe('in_progress');
  });

  it('a provider cancelling a confirmed booking must give a reason, and the deposit is owed back', async () => {
    const { service: supabase, state } = makeSupabase(confirmed, { vendorId: 'vend-1' });
    const svc = new BookingsService(supabase, noVehicles, noVendors, noNotifications);
    await expect(svc.transition('b1', 'vendor-profile', 'vendor', 'cancelled')).rejects.toThrow(/why/);
    await svc.transition('b1', 'vendor-profile', 'vendor', 'cancelled', 'The car failed its service');
    expect(state.updated?.cancelled_by).toBe('vendor');
    expect(state.updated?.cancellation_reason).toBe('The car failed its service');
    expect(state.updated?.deposit_refund_due).toBe(true);
  });

  it('a customer cancelling the day before keeps no claim on the deposit', async () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const { service: supabase, state } = makeSupabase({ ...confirmed, start_date: tomorrow });
    const svc = new BookingsService(supabase, noVehicles, noVendors, noNotifications);
    await svc.transition('b1', 'cust-1', 'customer', 'cancelled');
    expect(state.updated?.cancelled_by).toBe('customer');
    expect(state.updated?.deposit_refund_due).toBe(false);
  });
});

describe('depositRefundDue', () => {
  const now = new Date('2026-08-01T12:00:00Z');
  it('refunds a withdrawn request regardless of timing', () => {
    expect(depositRefundDue({ cancelledBy: 'customer', status: 'requested', startDate: '2026-08-01', now })).toBe(true);
  });
  it('refunds a customer who cancels 48h or more ahead', () => {
    expect(depositRefundDue({ cancelledBy: 'customer', status: 'confirmed', startDate: '2026-08-04', now })).toBe(true);
    expect(depositRefundDue({ cancelledBy: 'customer', status: 'confirmed', startDate: '2026-08-03', now })).toBe(false);
  });
  it('always refunds when the provider or Karu cancels', () => {
    expect(depositRefundDue({ cancelledBy: 'vendor', status: 'confirmed', startDate: '2026-08-01', now })).toBe(true);
    expect(depositRefundDue({ cancelledBy: 'admin', status: 'confirmed', startDate: '2026-08-01', now })).toBe(true);
  });
});

describe('BookingsService.create — self-booking guard (0030)', () => {
  const nextYear = new Date().getUTCFullYear() + 1;
  const vehicle = { id: 'v1', vendor_id: 'vend-1', status: 'active', daily_rate_xaf: 25000, driver_option: 'none', driver_daily_rate_xaf: null };
  const vendor = { id: 'vend-1', status: 'verified', delivery_fee_xaf: null, airport_fee_xaf: null };
  const svcWith = (opts: StubOpts) => {
    const { service } = makeSupabase(baseBooking, opts);
    return new BookingsService(
      service,
      { getById: async () => vehicle, availability: async () => ({ available: true }) } as unknown as VehiclesService,
      { getById: async () => vendor } as unknown as VendorsService,
      noNotifications,
    );
  };
  const dto = { vehicle_id: 'v1', start_date: `${nextYear}-08-01`, end_date: `${nextYear}-08-02` } as never;

  it("refuses when the customer's phone is the provider's WhatsApp, however it is written", async () => {
    const svc = svcWith({
      vendorRow: { profile_id: 'owner-1', contact_phone: null, whatsapp_number: '+237 6 70 00 00 01', contact_email: null },
      phones: { 'cust-1': '670000001' },
    });
    await expect(svc.create('cust-1', dto)).rejects.toThrow(/list yourself/);
  });

  it("refuses when the customer's login email is the provider's contact email", async () => {
    const svc = svcWith({
      vendorRow: { profile_id: 'owner-1', contact_phone: null, whatsapp_number: null, contact_email: 'Fleet@Example.com' },
      emails: { 'cust-1': 'fleet@example.com' },
    });
    await expect(svc.create('cust-1', dto)).rejects.toThrow(/list yourself/);
  });

  it('lets an unrelated customer book', async () => {
    const svc = svcWith({
      vendorRow: { profile_id: 'owner-1', contact_phone: '+237670000001', whatsapp_number: null, contact_email: 'fleet@example.com' },
      phones: { 'cust-1': '+447700900123' },
      emails: { 'cust-1': 'someone@else.com' },
    });
    await expect(svc.create('cust-1', dto)).resolves.toBeDefined();
  });
});

describe('BookingsService.transition — customer ID check before accepting (0032)', () => {
  const accept = (booking: Booking, opts: StubOpts, config?: unknown) => {
    const { service } = makeSupabase(booking, { vendorId: 'vend-1', ...opts });
    return new BookingsService(service, noVehicles, noVendors, noNotifications, config as never).transition(
      'b1', 'vendor-profile', 'vendor', 'confirmed',
    );
  };

  it('refuses to accept a self-drive request from an unverified customer', async () => {
    await expect(accept(baseBooking, { customer: { verification_status: 'pending' } })).rejects.toThrow(/ID check/);
  });

  it('refuses when the licence runs out before the car comes back', async () => {
    await expect(
      accept(baseBooking, { customer: { licence_expires_at: '2026-08-02' } }),
    ).rejects.toThrow(/expires/);
  });

  it('refuses a customer under the minimum age on day one', async () => {
    await expect(accept(baseBooking, { customer: { date_of_birth: '2006-01-01' } })).rejects.toThrow(/minimum age/);
  });

  it('does not ask for ID on a chauffeur rental', async () => {
    const result = await accept({ ...baseBooking, with_driver: true }, { customer: { verification_status: 'unverified' } });
    expect(result.status).toBe('confirmed');
  });

  it('can be switched off with REQUIRE_CUSTOMER_VERIFICATION=false', async () => {
    const config = { get: (k: string) => (k === 'REQUIRE_CUSTOMER_VERIFICATION' ? 'false' : undefined) };
    const result = await accept(baseBooking, { customer: { verification_status: 'unverified' } }, config);
    expect(result.status).toBe('confirmed');
  });
});
