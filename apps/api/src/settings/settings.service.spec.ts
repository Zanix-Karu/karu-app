import { describe, expect, it } from 'vitest';
import type { SupabaseService } from '../supabase/supabase.service';
import { DEFAULT_APPEARANCE, SettingsService } from './settings.service';

type Row = { key: string; value: unknown; updated_by?: string };

/** In-memory site_settings with just the calls SettingsService makes. */
function fakeSupabase(rows: Row[], failRead = false) {
  const db = {
    from: (table: string) => {
      if (table !== 'site_settings') throw new Error(`Unexpected table: ${table}`);
      let key = '';
      const builder = {
        select: () => builder,
        eq: (_col: string, v: string) => {
          key = v;
          return builder;
        },
        maybeSingle: async () =>
          failRead
            ? { data: null, error: { message: 'boom' } }
            : { data: rows.find((r) => r.key === key) ?? null, error: null },
        upsert: async (row: Row) => {
          const i = rows.findIndex((r) => r.key === row.key);
          if (i >= 0) rows[i] = row;
          else rows.push(row);
          return { error: null };
        },
      };
      return builder;
    },
  };
  return { db } as unknown as SupabaseService;
}

describe('SettingsService.appearance', () => {
  it('falls back to the default look when nothing is saved', async () => {
    expect(await new SettingsService(fakeSupabase([])).appearance()).toEqual(DEFAULT_APPEARANCE);
  });

  it('falls back to the default look when the read fails', async () => {
    expect(await new SettingsService(fakeSupabase([], true)).appearance()).toEqual(DEFAULT_APPEARANCE);
  });

  it('returns what an admin saved, filling any missing half', async () => {
    const svc = new SettingsService(fakeSupabase([{ key: 'appearance', value: { light: 'serika' } }]));
    expect(await svc.appearance()).toEqual({ light: 'serika', dark: DEFAULT_APPEARANCE.dark });
  });

  it('saves a new pair and records who saved it', async () => {
    const rows: Row[] = [];
    const svc = new SettingsService(fakeSupabase(rows));
    await svc.setAppearance('admin-1', { light: 'nord_light', dark: 'nord' });
    expect(rows).toEqual([{ key: 'appearance', value: { light: 'nord_light', dark: 'nord' }, updated_by: 'admin-1' }]);
    expect(await svc.appearance()).toEqual({ light: 'nord_light', dark: 'nord' });
  });
});
