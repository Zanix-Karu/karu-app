import { describe, expect, it } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { VendorsService } from '../vendors/vendors.service';

const PUBLIC_BASE = 'https://proj.supabase.co/storage/v1/object/public/vehicle-photos';

/**
 * A minimal-but-valid PNG: `image-size` only reads the signature (bytes 0-7),
 * the "IHDR" chunk-type marker (bytes 12-15) and the width/height uint32s
 * (bytes 16-23) — it never validates chunk length, CRC or pixel data — so
 * this is enough for `imageSize()` to report real dimensions without a real
 * encoded image.
 */
function fakePng(width: number, height: number): Buffer {
  const buf = Buffer.alloc(24);
  buf.write('\x89PNG\r\n\x1a\n', 0, 'binary');
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

const VALID_PHOTO = fakePng(1280, 960);
const TOO_SMALL_PHOTO = fakePng(200, 150);
const CORRUPT_BYTES = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

/** Stub covering the queries the photo flows make; records what they write. */
const makeSupabase = (vehicle: Record<string, unknown>, photoBytes: Record<string, Buffer> = {}) => {
  const writes = {
    photos: null as string[] | null,
    angles: null as Record<string, string> | null,
    removedPaths: [] as string[],
  };
  const db = {
    from: (table: string) => {
      if (table !== 'vehicles') throw new Error(`Unexpected table: ${table}`);
      return {
        select: () => ({
          eq: () => ({ single: async () => ({ data: vehicle, error: null }) }),
        }),
        update: (patch: { photos?: string[]; photo_angles?: Record<string, string> }) => {
          if (patch.photos) writes.photos = patch.photos;
          if (patch.photo_angles) writes.angles = patch.photo_angles;
          return {
            eq: () => ({
              select: () => ({
                single: async () => ({ data: { ...vehicle, ...patch }, error: null }),
              }),
            }),
          };
        },
      };
    },
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          writes.removedPaths.push(...paths);
          return { data: null, error: null };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `${PUBLIC_BASE}/${path}` } }),
        // Attach verifies the object landed in storage (with an allowed
        // mimetype); the stub says yes, as a real JPEG upload would.
        list: async (_folder: string, opts?: { search?: string }) => ({
          data: opts?.search ? [{ name: opts.search, metadata: { mimetype: 'image/jpeg' } }] : [],
          error: null,
        }),
        // Defaults to a valid photo for any path a test doesn't care about,
        // so existing angle-slot tests need no changes; a test exercising the
        // new checks overrides specific paths via `photoBytes`.
        download: async (path: string) => {
          const bytes = photoBytes[path] ?? VALID_PHOTO;
          return { data: { arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }, error: null };
        },
      }),
    },
  };
  return { supabase: { db } as unknown as SupabaseService, writes };
};

const noVendors = {} as VendorsService;

describe('VehiclesService.removePhoto', () => {
  it('drops the photo from the listing and deletes the stored object', async () => {
    const keep = `${PUBLIC_BASE}/veh-1/aaa-front.jpg`;
    const gone = `${PUBLIC_BASE}/veh-1/bbb-rear.jpg`;
    const { supabase, writes } = makeSupabase({ id: 'veh-1', photos: [keep, gone], photo_angles: {} });
    const svc = new VehiclesService(supabase, noVendors);

    const result = await svc.removePhoto('veh-1', 'admin-1', 'admin', gone);

    expect(result.photos).toEqual([keep]);
    expect(writes.photos).toEqual([keep]);
    expect(writes.removedPaths).toEqual(['veh-1/bbb-rear.jpg']);
  });

  it('clears the slot when the removed photo was filling one', async () => {
    const front = `${PUBLIC_BASE}/veh-1/aaa-front.jpg`;
    const { supabase, writes } = makeSupabase({
      id: 'veh-1',
      photos: [front],
      photo_angles: { front },
    });
    const svc = new VehiclesService(supabase, noVendors);

    await svc.removePhoto('veh-1', 'admin-1', 'admin', front);
    expect(writes.angles).toEqual({});
  });

  it('404s for a URL that is not on the listing, without writing anything', async () => {
    const { supabase, writes } = makeSupabase({
      id: 'veh-1',
      photos: [`${PUBLIC_BASE}/veh-1/a.jpg`],
      photo_angles: {},
    });
    const svc = new VehiclesService(supabase, noVendors);

    await expect(
      svc.removePhoto('veh-1', 'admin-1', 'admin', `${PUBLIC_BASE}/veh-1/other.jpg`),
    ).rejects.toThrow(NotFoundException);
    expect(writes.photos).toBeNull();
    expect(writes.removedPaths).toEqual([]);
  });

  it('never deletes storage objects outside the vehicle prefix (legacy/foreign URLs)', async () => {
    // Rows written before PATCH stopped accepting `photos` may hold arbitrary
    // URLs; removing one must not reach into another vehicle's folder.
    const foreign = `${PUBLIC_BASE}/veh-OTHER/stolen.jpg`;
    const { supabase, writes } = makeSupabase({ id: 'veh-1', photos: [foreign], photo_angles: {} });
    const svc = new VehiclesService(supabase, noVendors);

    const result = await svc.removePhoto('veh-1', 'admin-1', 'admin', foreign);

    expect(result.photos).toEqual([]);
    expect(writes.removedPaths).toEqual([]);
  });
});

describe('VehiclesService.attachPhoto (angle slots)', () => {
  it('fills a slot and appends to the gallery', async () => {
    const { supabase, writes } = makeSupabase({ id: 'veh-1', photos: [], photo_angles: {} });
    const svc = new VehiclesService(supabase, noVendors);

    await svc.attachPhoto('veh-1', 'admin-1', 'admin', 'veh-1/x-front.jpg', 'front');

    expect(writes.angles).toEqual({ front: `${PUBLIC_BASE}/veh-1/x-front.jpg` });
    expect(writes.photos).toEqual([`${PUBLIC_BASE}/veh-1/x-front.jpg`]);
  });

  it('replacing a filled slot swaps the photo and deletes the old object', async () => {
    const old = `${PUBLIC_BASE}/veh-1/old-front.jpg`;
    const { supabase, writes } = makeSupabase({
      id: 'veh-1',
      photos: [old],
      photo_angles: { front: old },
    });
    const svc = new VehiclesService(supabase, noVendors);

    await svc.attachPhoto('veh-1', 'admin-1', 'admin', 'veh-1/new-front.jpg', 'front');

    expect(writes.angles).toEqual({ front: `${PUBLIC_BASE}/veh-1/new-front.jpg` });
    expect(writes.photos).toEqual([`${PUBLIC_BASE}/veh-1/new-front.jpg`]);
    expect(writes.removedPaths).toEqual(['veh-1/old-front.jpg']);
  });

  it('rejects an uploaded object whose mimetype is not an allowed image type', async () => {
    const { supabase, writes } = makeSupabase({ id: 'veh-1', photos: [], photo_angles: {} });
    // Override storage for this test: the object exists, but as an SVG.
    (supabase.db as any).storage.from = () => ({
      remove: async (paths: string[]) => {
        writes.removedPaths.push(...paths);
        return { data: null, error: null };
      },
      list: async (_folder: string, opts?: { search?: string }) => ({
        data: opts?.search ? [{ name: opts.search, metadata: { mimetype: 'image/svg+xml' } }] : [],
        error: null,
      }),
    });
    const svc = new VehiclesService(supabase, noVendors);

    await expect(
      svc.attachPhoto('veh-1', 'admin-1', 'admin', 'veh-1/x-front.svg', 'front'),
    ).rejects.toThrow(BadRequestException);
    // The rejected object is deleted, and nothing is recorded on the listing.
    expect(writes.removedPaths).toEqual(['veh-1/x-front.svg']);
    expect(writes.photos).toBeNull();
  });

  it('rejects a file that cannot be read as an image (corrupt bytes)', async () => {
    const { supabase, writes } = makeSupabase(
      { id: 'veh-1', photos: [], photo_angles: {} },
      { 'veh-1/x-front.jpg': CORRUPT_BYTES },
    );
    const svc = new VehiclesService(supabase, noVendors);

    await expect(
      svc.attachPhoto('veh-1', 'admin-1', 'admin', 'veh-1/x-front.jpg', 'front'),
    ).rejects.toThrow(BadRequestException);
    expect(writes.removedPaths).toEqual(['veh-1/x-front.jpg']);
    expect(writes.photos).toBeNull();
  });

  it('rejects a photo below the minimum resolution', async () => {
    const { supabase, writes } = makeSupabase(
      { id: 'veh-1', photos: [], photo_angles: {} },
      { 'veh-1/x-front.jpg': TOO_SMALL_PHOTO },
    );
    const svc = new VehiclesService(supabase, noVendors);

    await expect(
      svc.attachPhoto('veh-1', 'admin-1', 'admin', 'veh-1/x-front.jpg', 'front'),
    ).rejects.toThrow(/too small/);
    expect(writes.removedPaths).toEqual(['veh-1/x-front.jpg']);
    expect(writes.photos).toBeNull();
  });

  it('accepts a valid photo at or above the minimum resolution', async () => {
    const { supabase, writes } = makeSupabase(
      { id: 'veh-1', photos: [], photo_angles: {} },
      { 'veh-1/x-front.jpg': VALID_PHOTO },
    );
    const svc = new VehiclesService(supabase, noVendors);

    await svc.attachPhoto('veh-1', 'admin-1', 'admin', 'veh-1/x-front.jpg', 'front');
    expect(writes.photos).toEqual([`${PUBLIC_BASE}/veh-1/x-front.jpg`]);
  });

  it('rejects an exact duplicate of a photo already attached to this listing', async () => {
    const existing = `${PUBLIC_BASE}/veh-1/aaa-front.jpg`;
    const { supabase, writes } = makeSupabase(
      { id: 'veh-1', photos: [existing], photo_angles: { front: existing } },
      {
        'veh-1/aaa-front.jpg': VALID_PHOTO,
        'veh-1/bbb-rear.jpg': VALID_PHOTO, // identical bytes, reused for a different angle
      },
    );
    const svc = new VehiclesService(supabase, noVendors);

    await expect(
      svc.attachPhoto('veh-1', 'admin-1', 'admin', 'veh-1/bbb-rear.jpg', 'rear'),
    ).rejects.toThrow(/already attached/);
    expect(writes.removedPaths).toEqual(['veh-1/bbb-rear.jpg']);
    expect(writes.photos).toBeNull();
  });

  it('accepts two different photos for two different angles', async () => {
    const existing = `${PUBLIC_BASE}/veh-1/aaa-front.jpg`;
    const { supabase, writes } = makeSupabase(
      { id: 'veh-1', photos: [existing], photo_angles: { front: existing } },
      {
        'veh-1/aaa-front.jpg': fakePng(1280, 960),
        'veh-1/bbb-rear.jpg': fakePng(1000, 800), // different dimensions => different bytes/hash
      },
    );
    const svc = new VehiclesService(supabase, noVendors);

    await svc.attachPhoto('veh-1', 'admin-1', 'admin', 'veh-1/bbb-rear.jpg', 'rear');
    expect(writes.angles).toEqual({ front: existing, rear: `${PUBLIC_BASE}/veh-1/bbb-rear.jpg` });
  });
});

describe('VehiclesService.update (photo gate)', () => {
  it('refuses to activate a listing with missing required photos, naming them', async () => {
    const { supabase, writes } = makeSupabase({
      id: 'veh-1',
      status: 'draft',
      photos: [],
      photo_angles: { front: `${PUBLIC_BASE}/veh-1/f.jpg` },
    });
    const svc = new VehiclesService(supabase, noVendors);

    await expect(svc.update('veh-1', 'admin-1', 'admin', { status: 'active' })).rejects.toThrow(
      /rear.*dashboard.*seats/s,
    );
    expect(writes.photos).toBeNull();
  });

  it('activates once all six slots are filled', async () => {
    const angles = Object.fromEntries(
      ['front', 'rear', 'left', 'right', 'dashboard', 'seats'].map((a) => [
        a,
        `${PUBLIC_BASE}/veh-1/${a}.jpg`,
      ]),
    );
    const { supabase } = makeSupabase({ id: 'veh-1', status: 'draft', photos: [], photo_angles: angles });
    const svc = new VehiclesService(supabase, noVendors);

    const result = await svc.update('veh-1', 'admin-1', 'admin', { status: 'active' });
    expect(result.status).toBe('active');
  });

  it('still rejects an empty patch', async () => {
    const { supabase } = makeSupabase({ id: 'veh-1', photos: [], photo_angles: {} });
    const svc = new VehiclesService(supabase, noVendors);
    await expect(svc.update('veh-1', 'admin-1', 'admin', {})).rejects.toThrow(BadRequestException);
  });
});
