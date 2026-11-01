import { describe, expect, it } from 'vitest';
import { VehiclesService } from './vehicles.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { VendorsService } from '../vendors/vendors.service';

/**
 * SEC-6 regression.
 *
 * Both public vehicle routes once selected '*', which shipped
 * registration_number — the plate printed on the car, matched by admins
 * against the carte grise — to anyone who called them. These assert on the
 * select string itself rather than on a fixture row, because the bug was in
 * what the query *asked for*: a fixture would keep passing the day someone
 * adds a sensitive column.
 */

/** Chainable stub that records the select string and swallows every filter. */
function makeSupabase(row: Record<string, unknown>) {
  const selects: string[] = [];
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of [
    'eq', 'neq', 'gte', 'lte', 'not', 'order', 'range', 'in', 'filter', 'or', 'ilike', 'limit',
  ]) {
    chain[m] = self;
  }
  chain.single = async () => ({ data: row, error: null });
  // `await q` on the browse query resolves the builder itself.
  chain.then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: [row], error: null, count: 1 });

  const db = {
    from: () => ({
      select: (cols: string) => {
        selects.push(cols);
        return chain;
      },
    }),
  };
  return { supabase: { db } as unknown as SupabaseService, selects };
}

const ROW = {
  id: 'v1',
  vendor_id: 'ven1',
  make: 'Toyota',
  model: 'Vitz',
  daily_rate_xaf: 25000,
  status: 'active',
  vendors: { id: 'ven1', business_name: 'Test', status: 'verified' },
};

const vendors = {} as VendorsService;

describe('public vehicle projection', () => {
  it('browse() never selects the number plate', async () => {
    const { supabase, selects } = makeSupabase(ROW);
    await new VehiclesService(supabase, vendors).browse({} as never);

    expect(selects).toHaveLength(1);
    expect(selects[0]).not.toContain('registration_number');
    expect(selects[0]).not.toMatch(/^\*/);
  });

  it('getPublicDetail() never selects the number plate', async () => {
    const { supabase, selects } = makeSupabase(ROW);
    await new VehiclesService(supabase, vendors).getPublicDetail('v1');

    expect(selects).toHaveLength(1);
    expect(selects[0]).not.toContain('registration_number');
    expect(selects[0]).not.toMatch(/^\*/);
  });

  it('compare() never selects the number plate', async () => {
    const { supabase, selects } = makeSupabase(ROW);
    await new VehiclesService(supabase, vendors).compare({ make: 'Toyota', model: 'Vitz' } as never);

    expect(selects).toHaveLength(1);
    expect(selects[0]).not.toContain('registration_number');
    expect(selects[0]).not.toMatch(/^\*/);
  });
});

/**
 * 0034: the provider's exact base is read for distances but must never ship
 * on a public route. These assert on the response, since the select has to
 * ask for lat/lng to do the maths.
 */
describe('public vehicle projection — provider location', () => {
  const pinned = {
    ...ROW,
    vendors: { id: 'ven1', business_name: 'Test', status: 'verified', lat: 4.051123, lng: 9.708547 },
  };

  it('getPublicDetail() rounds the base to about a kilometre and drops the exact pin', async () => {
    const { supabase } = makeSupabase(pinned);
    const detail = await new VehiclesService(supabase, vendors).getPublicDetail('v1');
    const vendor = detail.vendor as unknown as Record<string, unknown>;
    expect(vendor.lat).toBeUndefined();
    expect(vendor.lng).toBeUndefined();
    expect(vendor.approx_lat).toBe(4.05);
    expect(vendor.approx_lng).toBe(9.71);
  });

  it('browse() returns a distance, not the coordinates, when the searcher shares theirs', async () => {
    const { supabase } = makeSupabase(pinned);
    const result = await new VehiclesService(supabase, vendors).browse({
      near_lat: 4.0897,
      near_lng: 9.7426,
      sort: 'distance',
    } as never);
    const item = result.items[0] as unknown as Record<string, unknown>;
    expect(item.vendors).toBeUndefined();
    expect(item.distance_km).toBeGreaterThan(5);
    expect(item.distance_km).toBeLessThan(6);
  });
});
