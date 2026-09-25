import { describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { NotificationsService } from '../notifications/notifications.service';

/** A no-op stand-in — none of these tests care what mail actually sends. */
const makeNotifications = () => {
  const calls = {
    suspended: [] as unknown[],
    reinstated: [] as unknown[],
    customerNotices: [] as unknown[],
  };
  const notifications = {
    notifyVendorSuspended: vi.fn(async (vendor: unknown, reason: string) => {
      calls.suspended.push({ vendor, reason });
    }),
    notifyVendorReinstated: vi.fn(async (vendor: unknown) => {
      calls.reinstated.push(vendor);
    }),
    notifyCustomerVendorUnderReview: vi.fn(async (booking: unknown) => {
      calls.customerNotices.push(booking);
    }),
  };
  return { notifications: notifications as unknown as NotificationsService, calls };
};

/** Stub of the supabase-js builder covering just what AdminService touches. */
const makeSupabase = (opts: {
  vendorRow?: Record<string, unknown> | null;
  blockError?: { code: string; message: string };
  /** Rows returned by the REQ-9 "standing bookings" select on suspend. */
  standingBookings?: Array<Record<string, unknown>>;
}) => {
  const state = {
    vendorPatch: undefined as Record<string, unknown> | undefined,
    bookingsPatch: undefined as Record<string, unknown> | undefined,
    bookingsFilters: [] as Array<[string, unknown]>,
  };
  const db = {
    from: (table: string) => {
      if (table === 'vendors') {
        return {
          update: (patch: Record<string, unknown>) => {
            state.vendorPatch = patch;
            return {
              eq: () => ({
                select: () => ({
                  single: async () =>
                    opts.vendorRow !== null
                      ? { data: { ...opts.vendorRow, ...patch }, error: null }
                      : { data: null, error: { message: 'no rows' } },
                }),
              }),
            };
          },
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: opts.vendorRow ?? null }),
            }),
          }),
        };
      }
      if (table === 'bookings') {
        return {
          update: (patch: Record<string, unknown>) => {
            state.bookingsPatch = patch;
            const chain = {
              eq: (col: string, val: unknown) => {
                state.bookingsFilters.push([col, val]);
                return chain;
              },
              then: (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }),
            };
            return chain;
          },
          // REQ-9: the "standing confirmed/in_progress bookings" lookup on
          // suspend. Filters are accepted and ignored — the fixture rows are
          // already the ones that would match.
          select: () => ({
            eq: () => ({
              in: async () => ({ data: opts.standingBookings ?? [], error: null }),
            }),
          }),
        };
      }
      if (table === 'vehicle_blocks') {
        return {
          insert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: async () =>
                opts.blockError
                  ? { data: null, error: opts.blockError }
                  : { data: { id: 'blk-1', ...row }, error: null },
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
  return { service: { db } as unknown as SupabaseService, state };
};

describe('AdminService.setVendorStatus', () => {
  it('stamps verified_at when verifying', async () => {
    const { service: supabase, state } = makeSupabase({ vendorRow: { id: 'v1', status: 'pending' } });
    const admin = new AdminService(supabase, makeNotifications().notifications);
    const result = await admin.setVendorStatus('v1', { status: 'verified' });
    expect(result.status).toBe('verified');
    expect(state.vendorPatch?.verified_at).toBeDefined();
  });

  it('does NOT stamp verified_at when rejecting or suspending', async () => {
    const { service: supabase, state } = makeSupabase({ vendorRow: { id: 'v1', status: 'pending' } });
    const admin = new AdminService(supabase, makeNotifications().notifications);
    await admin.setVendorStatus('v1', { status: 'rejected' });
    expect(state.vendorPatch?.verified_at).toBeUndefined();
  });

  it('404s for an unknown vendor', async () => {
    const { service: supabase } = makeSupabase({ vendorRow: null });
    const admin = new AdminService(supabase, makeNotifications().notifications);
    await expect(admin.setVendorStatus('nope', { status: 'verified' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('blocks nonsensical transitions (pending → suspended)', async () => {
    const { service: supabase } = makeSupabase({ vendorRow: { id: 'v1', status: 'pending' } });
    const admin = new AdminService(supabase, makeNotifications().notifications);
    await expect(
      admin.setVendorStatus('v1', { status: 'suspended', reason: 'test' }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects a suspension with no reason (REQ-9)', async () => {
    const { service: supabase } = makeSupabase({ vendorRow: { id: 'v1', status: 'verified' } });
    const admin = new AdminService(supabase, makeNotifications().notifications);
    await expect(admin.setVendorStatus('v1', { status: 'suspended' })).rejects.toThrow(
      /reason/i,
    );
  });

  it('stores and clears the suspension reason across suspend/reinstate (REQ-9)', async () => {
    const { service: supabase, state } = makeSupabase({ vendorRow: { id: 'v1', status: 'verified' } });
    const { notifications, calls } = makeNotifications();
    const admin = new AdminService(supabase, notifications);
    await admin.setVendorStatus('v1', { status: 'suspended', reason: 'Insurance expired' });
    expect(state.vendorPatch?.suspension_reason).toBe('Insurance expired');
    expect(calls.suspended).toEqual([{ vendor: expect.anything(), reason: 'Insurance expired' }]);

    const { service: supabase2, state: state2 } = makeSupabase({
      vendorRow: { id: 'v1', status: 'suspended', suspension_reason: 'Insurance expired' },
    });
    const { notifications: notifications2, calls: calls2 } = makeNotifications();
    const admin2 = new AdminService(supabase2, notifications2);
    await admin2.setVendorStatus('v1', { status: 'verified' });
    expect(state2.vendorPatch?.suspension_reason).toBeNull();
    expect(calls2.reinstated).toHaveLength(1);
  });

  it('notifies customers with a standing booking when their vendor is suspended (REQ-9)', async () => {
    const { service: supabase } = makeSupabase({
      vendorRow: { id: 'v1', status: 'verified' },
      standingBookings: [{ id: 'bk-1' }, { id: 'bk-2' }],
    });
    const { notifications, calls } = makeNotifications();
    const admin = new AdminService(supabase, notifications);
    await admin.setVendorStatus('v1', { status: 'suspended', reason: 'Documents expired' });
    expect(calls.customerNotices).toHaveLength(2);
  });

  it('allows reinstating a suspended vendor', async () => {
    const { service: supabase } = makeSupabase({ vendorRow: { id: 'v1', status: 'suspended' } });
    const admin = new AdminService(supabase, makeNotifications().notifications);
    const result = await admin.setVendorStatus('v1', { status: 'verified' });
    expect(result.status).toBe('verified');
  });

  it('treats a same-status update as a no-op', async () => {
    const { service: supabase, state } = makeSupabase({ vendorRow: { id: 'v1', status: 'verified' } });
    const admin = new AdminService(supabase, makeNotifications().notifications);
    const result = await admin.setVendorStatus('v1', { status: 'verified' });
    expect(result.status).toBe('verified');
    expect(state.vendorPatch).toBeUndefined();
  });

  it('auto-declines open booking requests when suspending', async () => {
    const { service: supabase, state } = makeSupabase({ vendorRow: { id: 'v1', status: 'verified' } });
    const admin = new AdminService(supabase, makeNotifications().notifications);
    await admin.setVendorStatus('v1', { status: 'suspended', reason: 'test' });
    expect(state.bookingsPatch).toEqual({ status: 'rejected' });
    expect(state.bookingsFilters).toEqual([
      ['vendor_id', 'v1'],
      ['status', 'requested'],
    ]);
  });
});

describe('AdminService.createBlock', () => {
  it('maps the exclusion-constraint violation (23P01) to a 409', async () => {
    const { service: supabase } = makeSupabase({
      vendorRow: { id: 'v1' },
      blockError: { code: '23P01', message: 'conflicting key value' },
    });
    const admin = new AdminService(supabase, makeNotifications().notifications);
    await expect(
      admin.createBlock('admin-1', {
        vehicle_id: 'veh-1',
        start_date: '2026-08-01',
        end_date: '2026-08-03',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('creates a block and records who created it', async () => {
    const { service: supabase } = makeSupabase({ vendorRow: { id: 'v1' } });
    const admin = new AdminService(supabase, makeNotifications().notifications);
    const block = (await admin.createBlock('admin-1', {
      vehicle_id: 'veh-1',
      start_date: '2026-08-01',
      end_date: '2026-08-03',
      reason: 'maintenance',
    })) as { created_by: string };
    expect(block.created_by).toBe('admin-1');
  });
});

describe('AdminService.createVehicleOnBehalf', () => {
  it('refuses to create a listing straight to active — photos come first', async () => {
    const { service: supabase } = makeSupabase({ vendorRow: { id: 'v1' } });
    const admin = new AdminService(supabase, makeNotifications().notifications);
    await expect(
      admin.createVehicleOnBehalf({
        vendor_id: 'v1',
        make: 'Toyota',
        model: 'RAV4',
        year: 2020,
        seats: 5,
        registration_number: 'LT 123 AB',
        fuel_type: 'petrol',
        category: 'suv',
        daily_rate_xaf: 45000,
        city: 'douala',
        status: 'active',
      }),
    ).rejects.toThrow(/photos/);
  });

  it('404s when the target vendor does not exist', async () => {
    const { service: supabase } = makeSupabase({ vendorRow: null });
    const admin = new AdminService(supabase, makeNotifications().notifications);
    await expect(
      admin.createVehicleOnBehalf({
        vendor_id: 'missing',
        make: 'Toyota',
        model: 'RAV4',
        year: 2020,
        seats: 5,
        registration_number: 'LT 123 AB',
        fuel_type: 'petrol',
        category: 'suv',
        daily_rate_xaf: 45000,
        city: 'douala',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
