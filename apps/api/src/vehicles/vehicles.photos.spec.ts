import { describe, expect, it } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { VendorsService } from '../vendors/vendors.service';

const PUBLIC_BASE = 'https://proj.supabase.co/storage/v1/object/public/vehicle-photos';

/** Stub covering the queries the photo flows make; records what they write. */
const makeSupabase = (vehicle: Record<string, unknown>) => {
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
        // Attach verifies the object landed in storage; the stub says yes.
        list: async (_folder: string, opts?: { search?: string }) => ({
          data: opts?.search ? [{ name: opts.search }] : [],
          error: null,
        }),
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
