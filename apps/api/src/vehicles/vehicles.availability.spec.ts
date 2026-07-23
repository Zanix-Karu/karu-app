import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { assertValidWindow, datesOverlap } from './dates';
import { VehiclesService } from './vehicles.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { VendorsService } from '../vendors/vendors.service';

describe('date window rules', () => {
  it('accepts a valid window (and same-day windows)', () => {
    expect(() => assertValidWindow('2026-08-01', '2026-08-03')).not.toThrow();
    expect(() => assertValidWindow('2026-08-01', '2026-08-01')).not.toThrow();
  });

  it('rejects inverted and unparseable windows', () => {
    expect(() => assertValidWindow('2026-08-03', '2026-08-01')).toThrow(BadRequestException);
    expect(() => assertValidWindow('not-a-date', '2026-08-01')).toThrow(BadRequestException);
  });

  it('detects inclusive overlaps, including single-day touching ranges', () => {
    expect(datesOverlap('2026-08-01', '2026-08-03', '2026-08-03', '2026-08-05')).toBe(true);
    expect(datesOverlap('2026-08-01', '2026-08-03', '2026-08-04', '2026-08-05')).toBe(false);
    expect(datesOverlap('2026-08-02', '2026-08-02', '2026-08-01', '2026-08-05')).toBe(true);
  });
});

/** Stub covering the queries availability() makes. */
const makeSupabase = (opts: {
  vehicle?: Record<string, unknown> | null;
  bookingConflicts?: Array<{ start_date: string; end_date: string }>;
  blockConflicts?: Array<{ start_date: string; end_date: string }>;
}) => {
  const chain = (rows: unknown[]) => {
    const q: Record<string, unknown> = {
      eq: () => q,
      lte: () => q,
      gte: () => q,
      in: () => q,
      then: (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null }),
    };
    return q;
  };
  const db = {
    from: (table: string) => {
      if (table === 'vehicles') {
        return {
          select: () => ({
            eq: () => ({
              single: async () =>
                opts.vehicle !== null
                  ? { data: opts.vehicle ?? { id: 'veh-1' }, error: null }
                  : { data: null, error: { message: 'no rows' } },
            }),
          }),
        };
      }
      if (table === 'bookings') return { select: () => chain(opts.bookingConflicts ?? []) };
      if (table === 'vehicle_blocks') return { select: () => chain(opts.blockConflicts ?? []) };
      throw new Error(`Unexpected table: ${table}`);
    },
  };
  return { db } as unknown as SupabaseService;
};

const noVendors = {} as VendorsService;

describe('VehiclesService.availability', () => {
  it('is available when nothing overlaps', async () => {
    const svc = new VehiclesService(makeSupabase({}), noVendors);
    const result = await svc.availability('veh-1', '2026-08-01', '2026-08-03');
    expect(result).toEqual({ available: true, conflicts: [] });
  });

  it('is unavailable when a confirmed booking overlaps', async () => {
    const svc = new VehiclesService(
      makeSupabase({ bookingConflicts: [{ start_date: '2026-08-02', end_date: '2026-08-04' }] }),
      noVendors,
    );
    const result = await svc.availability('veh-1', '2026-08-01', '2026-08-03');
    expect(result.available).toBe(false);
    expect(result.conflicts).toHaveLength(1);
  });

  it('is unavailable when a manual block overlaps', async () => {
    const svc = new VehiclesService(
      makeSupabase({ blockConflicts: [{ start_date: '2026-08-01', end_date: '2026-08-10' }] }),
      noVendors,
    );
    const result = await svc.availability('veh-1', '2026-08-02', '2026-08-03');
    expect(result.available).toBe(false);
  });

  it('rejects an inverted window before touching the database', async () => {
    const svc = new VehiclesService(makeSupabase({}), noVendors);
    await expect(svc.availability('veh-1', '2026-08-05', '2026-08-01')).rejects.toThrow(
      BadRequestException,
    );
  });
});
