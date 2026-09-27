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

/**
 * `@IsOptional()` only skips validation for `undefined`/`null`, not for an
 * empty string — clearing an optional textarea submits `''`, which would
 * otherwise reach a validator like `@WordCountRange()` as a real value rather
 * than "not provided". Turning blank/whitespace-only into `null` here lets
 * `@IsOptional()` correctly short-circuit, same ordering as `NormalizeEmail`
 * (runs during class-transformer's plainToInstance pass, before validators).
 */
export function EmptyToNull() {
  return Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? null : value,
  );
}
