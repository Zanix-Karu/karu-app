import { describe, expect, it } from 'vitest';
import { VehiclesService } from './vehicles.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { VendorsService } from '../vendors/vendors.service';

/**
 * `compare()` groups "the same vehicle across vendors" by a normalized
 * (trimmed, case-insensitive) make+model(+year) match — no canonical
 * catalog, no schema change. These lock in: price-ascending order,
 * `exclude_vehicle_id` honored, active/verified-only, and that the match is
 * genuinely case/whitespace-insensitive (the whole point of the feature).
 */

interface Row {
  id: string;
  make: string;
  model: string;
  year: number;
  daily_rate_xaf: number;
  status: string;
  vendors: { id: string; business_name: string; status: string };
}

/** In-memory fake that actually applies filters, unlike the chainable no-op
 *  stub used for pure select-string assertions — needed here because these
 *  tests assert on which rows survive filtering and their order. */
function makeSupabase(rows: Row[]) {
  const chain: {
    filters: Array<(r: Row) => boolean>;
    orderCol?: string;
    ascending?: boolean;
    limitN?: number;
  } = { filters: [] };

  const builder = {
    eq: (col: string, val: unknown) => {
      chain.filters.push((r) => (r as never as Record<string, unknown>)[col] === val);
      return builder;
    },
    neq: (col: string, val: unknown) => {
      chain.filters.push((r) => (r as never as Record<string, unknown>)[col] !== val);
      return builder;
    },
    ilike: (col: string, val: string) => {
      const needle = val.replace(/^%|%$/g, '').toLowerCase();
      chain.filters.push((r) => String((r as never as Record<string, unknown>)[col]).toLowerCase() === needle.toLowerCase());
      return builder;
    },
    order: (col: string, opts: { ascending: boolean }) => {
      chain.orderCol = col;
      chain.ascending = opts.ascending;
      return builder;
    },
    limit: (n: number) => {
      chain.limitN = n;
      return builder;
    },
    then: (resolve: (v: unknown) => unknown) => {
      // vendors!inner filtering (vendors.status) applies against the nested object.
      let out = rows.filter((r) =>
        chain.filters.every((f) => {
          try {
            return f(r);
          } catch {
            return false;
          }
        }),
      );
      if (chain.orderCol) {
        const col = chain.orderCol;
        out = [...out].sort((a, b) => {
          const av = (a as never as Record<string, unknown>)[col] as number;
          const bv = (b as never as Record<string, unknown>)[col] as number;
          return chain.ascending ? av - bv : bv - av;
        });
      }
      if (chain.limitN !== undefined) out = out.slice(0, chain.limitN);
      return resolve({ data: out, error: null });
    },
  };

  // A second filter path is needed for `vendors.status` (dot-notation on the
  // joined table) — PostgREST accepts `.eq('vendors.status', 'verified')`
  // against the join; model that by reading the nested field.
  const eqOrig = builder.eq;
  builder.eq = (col: string, val: unknown) => {
    if (col === 'vendors.status') {
      chain.filters.push((r) => r.vendors.status === val);
      return builder;
    }
    return eqOrig(col, val);
  };

  const lowLevel = {
    from: () => ({ select: () => builder }),
  };
  return { supabase: { db: lowLevel } as unknown as SupabaseService };
}

const vendors = {} as VendorsService;

const baseVendor = { id: 'ven1', business_name: 'Vendor A', status: 'verified' };

describe('compare()', () => {
  it('orders matches by price ascending', async () => {
    const { supabase } = makeSupabase([
      { id: 'v1', make: 'Toyota', model: 'Corolla', year: 2020, daily_rate_xaf: 30000, status: 'active', vendors: baseVendor },
      { id: 'v2', make: 'Toyota', model: 'Corolla', year: 2020, daily_rate_xaf: 20000, status: 'active', vendors: { ...baseVendor, id: 'ven2' } },
    ]);
    const result = await new VehiclesService(supabase, vendors).compare({
      make: 'Toyota',
      model: 'Corolla',
    } as never);
    expect(result.map((v) => v.id)).toEqual(['v2', 'v1']);
  });

  it('excludes the given exclude_vehicle_id', async () => {
    const { supabase } = makeSupabase([
      { id: 'v1', make: 'Toyota', model: 'Corolla', year: 2020, daily_rate_xaf: 30000, status: 'active', vendors: baseVendor },
      { id: 'v2', make: 'Toyota', model: 'Corolla', year: 2020, daily_rate_xaf: 20000, status: 'active', vendors: { ...baseVendor, id: 'ven2' } },
    ]);
    const result = await new VehiclesService(supabase, vendors).compare({
      make: 'Toyota',
      model: 'Corolla',
      exclude_vehicle_id: 'v1',
    } as never);
    expect(result.map((v) => v.id)).toEqual(['v2']);
  });

  it('only returns active listings from verified vendors', async () => {
    const { supabase } = makeSupabase([
      { id: 'v1', make: 'Toyota', model: 'Corolla', year: 2020, daily_rate_xaf: 30000, status: 'active', vendors: baseVendor },
      { id: 'v2', make: 'Toyota', model: 'Corolla', year: 2020, daily_rate_xaf: 20000, status: 'draft', vendors: baseVendor },
      { id: 'v3', make: 'Toyota', model: 'Corolla', year: 2020, daily_rate_xaf: 15000, status: 'active', vendors: { ...baseVendor, status: 'pending' } },
    ]);
    const result = await new VehiclesService(supabase, vendors).compare({
      make: 'Toyota',
      model: 'Corolla',
    } as never);
    expect(result.map((v) => v.id)).toEqual(['v1']);
  });

  it('matches case-insensitively and ignores surrounding whitespace', async () => {
    const { supabase } = makeSupabase([
      { id: 'v1', make: 'Toyota', model: 'Corolla', year: 2020, daily_rate_xaf: 30000, status: 'active', vendors: baseVendor },
    ]);
    const result = await new VehiclesService(supabase, vendors).compare({
      make: 'toyota ',
      model: ' COROLLA',
    } as never);
    expect(result.map((v) => v.id)).toEqual(['v1']);
  });
});
