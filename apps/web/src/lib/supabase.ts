import { createClient } from '@supabase/supabase-js';

/**
 * Browser Supabase client — used ONLY for auth (login, signup, session, OTP).
 * All data access goes through the NestJS API, never directly to Postgres.
 * The anon key is safe to ship; it is gated by RLS.
 *
 * `flowType: 'pkce'` replaces the library default. Under the implicit flow the
 * access and refresh tokens arrive in the URL fragment, where they can leak via
 * history, the Referer header and any analytics that records the location. PKCE
 * puts a single-use code in the query string instead and exchanges it for the
 * session over the network.
 *
 * What this does NOT do is stop an XSS reading the session: it still lives in
 * localStorage, which is what `persistSession` means. The control for that is
 * the CSP shipped in apps/web/vercel.json — PKCE narrows the URL-leak surface,
 * the CSP narrows the script-injection surface, and they are not substitutes.
 *
 * Trade-off worth knowing: PKCE stores its code verifier in the browser that
 * started the flow, so a confirmation or reset link opened on a *different*
 * device than the one that requested it will fail where implicit would have
 * worked. `detectSessionInUrl` stays on so ResetPasswordScreen's
 * PASSWORD_RECOVERY handling keeps working on the same device.
 */
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
