import { Transform } from 'class-transformer';

/**
 * REQ-7: an email like "m fnalaha @ g mail . com" — whitespace inside or
 * around it, however it got there (a stray space-bar tap, a copy-paste
 * artefact) — must not be treated as a distinct identity from the clean
 * address. Supabase Auth is called directly from the web client for
 * sign-up/sign-in, so the client normalises there; this is the server-side
 * boundary for every other free-text email field (vendor contact emails),
 * which holds regardless of what client sent the request.
 *
 * Runs during class-transformer's plainToInstance pass, before
 * `@IsEmail()` sees the value — so validation checks the normalised form.
 */
export function NormalizeEmail() {
  return Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\s+/g, '').toLowerCase() : value,
  );
}
