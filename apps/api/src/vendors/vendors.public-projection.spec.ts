import { describe, expect, it } from 'vitest';
import { VendorsService } from './vendors.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { ReviewsService } from '../reviews/reviews.service';

/**
 * `listPublic()`'s select list *is* the security boundary (it backs the
 * public `GET /vendors` directory) — same reasoning as
 * vehicles.public-projection.spec.ts. Asserts on the select string itself so
 * this keeps failing the day a sensitive column is added, not just the day a
 * fixture's shape changes.
 */

/** Chainable stub that records the select string and resolves via `.then`. */
function makeSupabase(rows: Record<string, unknown>[]) {
  const selects: string[] = [];
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of ['eq', 'neq', 'gte', 'lte', 'not', 'order', 'range', 'in', 'filter', 'or']) {
    chain[m] = self;
  }
  chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });

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
  id: 'ven1',
  business_name: 'Test Motors',
  city: 'douala',
  delivery_fee_xaf: 5000,
  airport_fee_xaf: 10000,
  bio: 'A short blurb.',
  status: 'verified',
  verified_at: '2026-01-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const reviews = { summaryByVendor: async () => ({}) } as unknown as ReviewsService;

describe('public vendor projection', () => {
  it('listPublic() selects bio but none of the private/internal fields', async () => {
    const { supabase, selects } = makeSupabase([ROW]);
    await new VendorsService(supabase, reviews).listPublic();

    expect(selects).toHaveLength(1);
    expect(selects[0]).toContain('bio');
    for (const field of [
      'contact_person',
      'contact_phone',
      'contact_email',
      'whatsapp_number',
      'address',
      'rccm_number',
      'suspension_reason',
      'profile_id',
    ]) {
      expect(selects[0]).not.toContain(field);
    }
    expect(selects[0]).not.toMatch(/^\*/);
  });
});
