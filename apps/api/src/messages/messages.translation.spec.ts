import { describe, expect, it } from 'vitest';
import { MessagesService } from './messages.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { BookingsService } from '../bookings/bookings.service';
import type { NotificationsService } from '../notifications/notifications.service';

/** Stub just enough of supabase-js for the translation path. */
const makeDb = (message: Record<string, unknown> | null, cached: string | null = null) => {
  const inserted: Array<Record<string, unknown>> = [];
  const chain = (data: unknown) => {
    const c: Record<string, unknown> = {
      select: () => c,
      eq: () => c,
      maybeSingle: async () => ({ data }),
    };
    return c;
  };
  const db = {
    from: (table: string) => {
      if (table === 'booking_messages') return chain(message);
      if (table === 'booking_message_translations') {
        return {
          ...chain(cached ? { body: cached } : null),
          insert: async (row: Record<string, unknown>) => {
            inserted.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
  return { supabase: { db } as unknown as SupabaseService, inserted };
};

const bookings = { getForUser: async () => ({}) } as unknown as BookingsService;
const notifications = {} as NotificationsService;
const configWithKey = { get: () => 'test-key:fx' } as never;

const svcWith = (supabase: SupabaseService, translated: string[]) => {
  const svc = new MessagesService(supabase, bookings, notifications, configWithKey);
  // Swap the real DeepL client for a recorder.
  (svc as unknown as { translator: unknown }).translator = {
    name: 'fake',
    canTranslate: true,
    translate: async (text: string) => {
      translated.push(text);
      return `FR: ${text}`;
    },
  };
  return svc;
};

describe('MessagesService.translation (0031)', () => {
  it('translates the stored, already-redacted body and caches it', async () => {
    const { supabase, inserted } = makeDb({
      body: 'Call me on [hidden — contact stays on Karu]',
      language: 'en',
    });
    const seen: string[] = [];
    const out = await svcWith(supabase, seen).translation('b1', 'm1', 'u1', 'vendor', 'fr');
    expect(seen).toEqual(['Call me on [hidden — contact stays on Karu]']);
    expect(out.body).toContain('[hidden');
    expect(inserted[0]).toMatchObject({ message_id: 'm1', target_lang: 'fr' });
  });

  it('serves a cached translation without calling the engine', async () => {
    const { supabase } = makeDb({ body: 'Hello', language: 'en' }, 'Bonjour');
    const seen: string[] = [];
    const out = await svcWith(supabase, seen).translation('b1', 'm1', 'u1', 'vendor', 'fr');
    expect(out).toEqual({ body: 'Bonjour', cached: true });
    expect(seen).toEqual([]);
  });

  it('has nothing to do when the message is already in the reader language', async () => {
    const { supabase } = makeDb({ body: 'Merci, à demain', language: 'fr' });
    const seen: string[] = [];
    const out = await svcWith(supabase, seen).translation('b1', 'm1', 'u1', 'vendor', 'fr');
    expect(out.body).toBe('Merci, à demain');
    expect(seen).toEqual([]);
  });
});
