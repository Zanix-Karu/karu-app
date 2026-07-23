import { describe, expect, it } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';
import type { SupabaseService } from '../supabase/supabase.service';

/** Stub of the supabase-js builder covering just what AdminService touches. */
const makeSupabase = (opts: {
  vendorRow?: Record<string, unknown> | null;
  blockError?: { code: string; message: string };
}) => {
  const state = { vendorPatch: undefined as Record<string, unknown> | undefined };
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
    const admin = new AdminService(supabase);
    const result = await admin.setVendorStatus('v1', { status: 'verified' });
    expect(result.status).toBe('verified');
    expect(state.vendorPatch?.verified_at).toBeDefined();
  });

  it('does NOT stamp verified_at when rejecting or suspending', async () => {
    const { service: supabase, state } = makeSupabase({ vendorRow: { id: 'v1', status: 'pending' } });
    const admin = new AdminService(supabase);
    await admin.setVendorStatus('v1', { status: 'rejected' });
    expect(state.vendorPatch?.verified_at).toBeUndefined();
  });

  it('404s for an unknown vendor', async () => {
    const { service: supabase } = makeSupabase({ vendorRow: null });
    const admin = new AdminService(supabase);
    await expect(admin.setVendorStatus('nope', { status: 'verified' })).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('AdminService.createBlock', () => {
  it('maps the exclusion-constraint violation (23P01) to a 409', async () => {
    const { service: supabase } = makeSupabase({
      vendorRow: { id: 'v1' },
      blockError: { code: '23P01', message: 'conflicting key value' },
    });
    const admin = new AdminService(supabase);
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
    const admin = new AdminService(supabase);
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
  it('404s when the target vendor does not exist', async () => {
    const { service: supabase } = makeSupabase({ vendorRow: null });
    const admin = new AdminService(supabase);
    await expect(
      admin.createVehicleOnBehalf({
        vendor_id: 'missing',
        make: 'Toyota',
        model: 'RAV4',
        category: 'suv',
        daily_rate_xaf: 45000,
        city: 'douala',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
