import { describe, expect, it } from 'vitest';
import { AdminService } from './admin.service';
import type { SupabaseService } from '../supabase/supabase.service';

type Row = Record<string, unknown>;

/**
 * A minimal in-memory stand-in for supabase-js's query builder — just
 * enough of it for AdminService.overview(): chained eq/neq/not/is/lt/gte/lte
 * filters on a table's rows, resolving to `{ count, error }` the moment it's
 * awaited (each filter method returns the same builder; awaiting it is what
 * "fires" the request, same as the real PostgrestFilterBuilder).
 */
function fakeSupabase(tables: Record<string, Row[]>): SupabaseService {
  const db = {
    from: (table: string) => {
      let rows = tables[table] ?? [];
      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          rows = rows.filter((r) => r[col] === val);
          return builder;
        },
        neq: (col: string, val: unknown) => {
          rows = rows.filter((r) => r[col] !== val);
          return builder;
        },
        not: (col: string, _op: string, val: unknown) => {
          rows = rows.filter((r) =>
            val === null ? r[col] !== null && r[col] !== undefined : r[col] !== val,
          );
          return builder;
        },
        is: (col: string, val: unknown) => {
          rows = rows.filter((r) =>
            val === null ? r[col] === null || r[col] === undefined : r[col] === val,
          );
          return builder;
        },
        lt: (col: string, val: string) => {
          rows = rows.filter((r) => typeof r[col] === 'string' && (r[col] as string) < val);
          return builder;
        },
        gte: (col: string, val: string) => {
          rows = rows.filter((r) => typeof r[col] === 'string' && (r[col] as string) >= val);
          return builder;
        },
        lte: (col: string, val: string) => {
          rows = rows.filter((r) => typeof r[col] === 'string' && (r[col] as string) <= val);
          return builder;
        },
        then: (resolve: (v: { count: number; error: null }) => unknown) =>
          resolve({ count: rows.length, error: null }),
      };
      return builder;
    },
  };
  return { db } as unknown as SupabaseService;
}

const iso = (daysFromNow: number) =>
  new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString();

describe('AdminService.overview — document expiry (REQ-12)', () => {
  it('counts already-expired and soon-to-expire documents separately, ignoring rejected ones', async () => {
    const supabase = fakeSupabase({
      vendors: [],
      bookings: [],
      vehicles: [],
      profiles: [],
      vendor_documents: [
        { status: 'approved', expires_at: iso(-5) }, // expired
        { status: 'pending', expires_at: iso(-1) }, // expired
        { status: 'rejected', expires_at: iso(-10) }, // rejected — doesn't count
        { status: 'approved', expires_at: iso(10) }, // expiring soon (within 30d)
        { status: 'pending', expires_at: iso(29) }, // expiring soon
        { status: 'approved', expires_at: iso(60) }, // fine, well outside the window
        { status: 'approved', expires_at: null }, // never expires
      ],
    });
    const admin = new AdminService(supabase);
    const result = await admin.overview();
    expect(result.expiredDocuments).toBe(2);
    expect(result.documentsExpiringSoon).toBe(2);
    expect(result.docExpiryWarningDays).toBe(30);
  });

  it('reports zero for both counters when nothing is expiring', async () => {
    const supabase = fakeSupabase({
      vendors: [],
      bookings: [],
      vehicles: [],
      profiles: [],
      vendor_documents: [{ status: 'approved', expires_at: iso(90) }],
    });
    const admin = new AdminService(supabase);
    const result = await admin.overview();
    expect(result.expiredDocuments).toBe(0);
    expect(result.documentsExpiringSoon).toBe(0);
  });
});
