import { describe, expect, it } from 'vitest';
import { AdminService } from './admin.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { NotificationsService } from '../notifications/notifications.service';

type Row = Record<string, unknown>;

// listEmailLog() never touches notifications — a stub is enough.
const noNotifications = {} as unknown as NotificationsService;

/**
 * A minimal in-memory stand-in for the one chain listEmailLog() uses:
 * select().eq()?.order().limit(), resolving on await. Same idea as
 * admin.overview.spec.ts's fakeSupabase, scoped to just this call shape.
 */
function fakeSupabase(rows: Row[]): SupabaseService {
  const db = {
    from: (table: string) => {
      if (table !== 'email_log') throw new Error(`Unexpected table: ${table}`);
      let filtered = [...rows];
      let limit = Infinity;
      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          filtered = filtered.filter((r) => r[col] === val);
          return builder;
        },
        order: () => {
          // created_at descending, matching the real query.
          filtered = [...filtered].sort(
            (a, b) => String(b.created_at).localeCompare(String(a.created_at)),
          );
          return builder;
        },
        limit: (n: number) => {
          limit = n;
          return builder;
        },
        then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
          resolve({ data: filtered.slice(0, limit), error: null }),
      };
      return builder;
    },
  };
  return { db } as unknown as SupabaseService;
}

describe('AdminService.listEmailLog (REQ-4)', () => {
  const rows: Row[] = [
    { id: '1', status: 'sent', created_at: '2026-09-01T00:00:00Z' },
    { id: '2', status: 'failed', created_at: '2026-09-02T00:00:00Z' },
    { id: '3', status: 'failed', created_at: '2026-09-03T00:00:00Z' },
  ];

  it('returns every row, most recent first, with no filter', async () => {
    const admin = new AdminService(fakeSupabase(rows), noNotifications);
    const result = (await admin.listEmailLog()) as Row[];
    expect(result.map((r) => r.id)).toEqual(['3', '2', '1']);
  });

  it('narrows to just the failures when asked', async () => {
    const admin = new AdminService(fakeSupabase(rows), noNotifications);
    const result = (await admin.listEmailLog('failed')) as Row[];
    expect(result.map((r) => r.id)).toEqual(['3', '2']);
  });

  it('caps at 100 rows', async () => {
    const many = Array.from({ length: 150 }, (_, i) => ({
      id: String(i),
      status: 'sent',
      created_at: new Date(2026, 0, 1, 0, 0, i).toISOString(),
    }));
    const admin = new AdminService(fakeSupabase(many), noNotifications);
    const result = (await admin.listEmailLog()) as Row[];
    expect(result).toHaveLength(100);
  });
});
