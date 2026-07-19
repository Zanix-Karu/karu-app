import { createClient } from '@supabase/supabase-js';

/**
 * Browser Supabase client — used ONLY for auth (login, signup, session, OTP).
 * All data access goes through the NestJS API, never directly to Postgres.
 * The anon key is safe to ship; it is gated by RLS.
 */
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);
