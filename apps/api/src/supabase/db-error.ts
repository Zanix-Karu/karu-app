import { Logger } from '@nestjs/common';

const logger = new Logger('SupabaseError');

/**
 * Never forward a Supabase/PostgREST error's own `message` to an API
 * response — it can carry internal schema/constraint detail, or (when the
 * failure is at the network layer, e.g. Supabase being unreachable) a raw
 * driver exception like "TypeError: fetch failed". Log the real error
 * server-side and return a safe, generic message for the exception instead.
 */
export function dbErrorMessage(error: unknown, fallback: string): string {
  if (error) logger.error(fallback, error as Error);
  return fallback;
}
