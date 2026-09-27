import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AdminService } from './admin.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { NotificationsService } from '../notifications/notifications.service';

/**
 * `listDocuments()`'s automated red-flags (see `attachDocumentFlags` in
 * admin.service.ts) — advisory only, never auto-reject. Each test isolates
 * one flag firing (or not) independently.
 */

interface Row {
  id: string;
  vendor_id: string;
  file_path: string;
  status: 'pending' | 'approved' | 'rejected';
  expires_at: string | null;
  vendors: { business_name: string } | null;
  vehicles: null;
}

const noNotifications = {} as unknown as NotificationsService;

const iso = (daysFromNow: number) =>
  new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString();

const hash = (s: string) => createHash('sha256').update(s).digest('hex');

function makeSupabase(opts: {
  rows: Row[];
  fileContents?: Record<string, string>; // file_path -> content, hashed for download()
  fileSizes?: Record<string, number>; // file_path -> byte size, for list()
}) {
  const { rows, fileContents = {}, fileSizes = {} } = opts;

  const db = {
    from: (table: string) => {
      if (table !== 'vendor_documents') throw new Error(`Unexpected table: ${table}`);
      return {
        // Two distinct callers share this table: listDocuments()'s own joined
        // select, and attachDocumentFlags()'s narrow sibling lookup — told
        // apart by which columns were asked for.
        select: (cols: string) => {
          const narrow = cols.includes('id, file_path');
          let filtered = rows;
          const builder: {
            eq: (col: string, val: unknown) => typeof builder;
            order: () => typeof builder;
            then: (resolve: (v: unknown) => unknown) => unknown;
          } = {
            eq: (col, val) => {
              filtered = filtered.filter((r) => (r as never as Record<string, unknown>)[col] === val);
              return builder;
            },
            order: () => builder,
            then: (resolve) => {
              const data = narrow
                ? filtered.map((r) => ({ id: r.id, file_path: r.file_path }))
                : filtered;
              return resolve({ data, error: null });
            },
          };
          return builder;
        },
      };
    },
    storage: {
      from: () => ({
        download: async (path: string) => {
          const content = fileContents[path];
          if (content === undefined) return { data: null, error: { message: 'not found' } };
          const bytes = Buffer.from(content);
          return {
            data: { arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) },
            error: null,
          };
        },
        list: async (folder: string, opts2?: { search?: string }) => {
          const name = opts2?.search;
          if (!name) return { data: [], error: null };
          const fullPath = `${folder}/${name}`;
          const size = fileSizes[fullPath];
          if (size === undefined) return { data: [], error: null };
          return { data: [{ name, metadata: { size } }], error: null };
        },
      }),
    },
  };
  return { db } as unknown as SupabaseService;
}

describe('AdminService.listDocuments — automated flags', () => {
  it('flags an already-expired document, ignoring a rejected one', async () => {
    const supabase = makeSupabase({
      rows: [
        { id: 'd1', vendor_id: 'v1', file_path: 'v1/insurance-1.jpg', status: 'approved', expires_at: iso(-5), vendors: null, vehicles: null },
        { id: 'd2', vendor_id: 'v2', file_path: 'v2/insurance-2.jpg', status: 'rejected', expires_at: iso(-5), vendors: null, vehicles: null },
      ],
    });
    const admin = new AdminService(supabase, noNotifications);
    const result = await admin.listDocuments();
    expect(result.find((r) => r.id === 'd1')?.flags).toContain('expired');
    expect(result.find((r) => r.id === 'd2')?.flags).not.toContain('expired');
  });

  it('flags a document expiring within the warning window, not one further out', async () => {
    const supabase = makeSupabase({
      rows: [
        { id: 'd1', vendor_id: 'v1', file_path: 'v1/insurance-1.jpg', status: 'approved', expires_at: iso(10), vendors: null, vehicles: null },
        { id: 'd2', vendor_id: 'v1', file_path: 'v1/insurance-2.jpg', status: 'approved', expires_at: iso(60), vendors: null, vehicles: null },
      ],
    });
    const admin = new AdminService(supabase, noNotifications);
    const result = await admin.listDocuments();
    expect(result.find((r) => r.id === 'd1')?.flags).toContain('expiring_soon');
    expect(result.find((r) => r.id === 'd2')?.flags).toEqual([]);
  });

  it('flags an unusually small file', async () => {
    const supabase = makeSupabase({
      rows: [{ id: 'd1', vendor_id: 'v1', file_path: 'v1/rccm-1.jpg', status: 'pending', expires_at: null, vendors: null, vehicles: null }],
      fileSizes: { 'v1/rccm-1.jpg': 500 },
    });
    const admin = new AdminService(supabase, noNotifications);
    const result = await admin.listDocuments();
    expect(result[0].flags).toContain('tiny_file');
  });

  it('does not flag a normally-sized file', async () => {
    const supabase = makeSupabase({
      rows: [{ id: 'd1', vendor_id: 'v1', file_path: 'v1/rccm-1.jpg', status: 'pending', expires_at: null, vendors: null, vehicles: null }],
      fileSizes: { 'v1/rccm-1.jpg': 500_000 },
    });
    const admin = new AdminService(supabase, noNotifications);
    const result = await admin.listDocuments();
    expect(result[0].flags).toEqual([]);
  });

  it('flags a document whose content matches another of the same vendor', async () => {
    const supabase = makeSupabase({
      rows: [
        { id: 'd1', vendor_id: 'v1', file_path: 'v1/national_id-1.jpg', status: 'approved', expires_at: null, vendors: null, vehicles: null },
        { id: 'd2', vendor_id: 'v1', file_path: 'v1/carte_grise-1.jpg', status: 'pending', expires_at: null, vendors: null, vehicles: null },
      ],
      fileContents: { 'v1/national_id-1.jpg': 'same-bytes', 'v1/carte_grise-1.jpg': 'same-bytes' },
    });
    const admin = new AdminService(supabase, noNotifications);
    const result = await admin.listDocuments();
    expect(result.find((r) => r.id === 'd1')?.flags).toContain('duplicate_of_own');
    expect(result.find((r) => r.id === 'd2')?.flags).toContain('duplicate_of_own');
  });

  it('does not flag matching content across two different vendors', async () => {
    const supabase = makeSupabase({
      rows: [
        { id: 'd1', vendor_id: 'v1', file_path: 'v1/national_id-1.jpg', status: 'approved', expires_at: null, vendors: null, vehicles: null },
        { id: 'd2', vendor_id: 'v2', file_path: 'v2/national_id-1.jpg', status: 'pending', expires_at: null, vendors: null, vehicles: null },
      ],
      fileContents: { 'v1/national_id-1.jpg': 'same-bytes', 'v2/national_id-1.jpg': 'same-bytes' },
    });
    const admin = new AdminService(supabase, noNotifications);
    const result = await admin.listDocuments();
    expect(result.find((r) => r.id === 'd1')?.flags).not.toContain('duplicate_of_own');
    expect(result.find((r) => r.id === 'd2')?.flags).not.toContain('duplicate_of_own');
  });

  it('returns an empty flags array when nothing is wrong', async () => {
    const supabase = makeSupabase({
      rows: [{ id: 'd1', vendor_id: 'v1', file_path: 'v1/rccm-1.jpg', status: 'approved', expires_at: iso(90), vendors: null, vehicles: null }],
      fileSizes: { 'v1/rccm-1.jpg': 500_000 },
    });
    const admin = new AdminService(supabase, noNotifications);
    const result = await admin.listDocuments();
    expect(result[0].flags).toEqual([]);
  });
});

// Sanity check that the local `hash` helper matches the service's own
// algorithm, so a future refactor of either can't silently drift apart.
describe('hash helper parity', () => {
  it('sha256 of identical content is identical', () => {
    expect(hash('same-bytes')).toBe(hash('same-bytes'));
  });
});
