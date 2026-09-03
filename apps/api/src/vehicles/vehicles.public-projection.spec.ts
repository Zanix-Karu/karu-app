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
    'eq', 'neq', 'gte', 'lte', 'not', 'order', 'range', 'in', 'filter', 'or',
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
});
