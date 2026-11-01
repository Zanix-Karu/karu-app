import { renderComingSoon, type Locale } from './page';

/**
 * Pre-launch gate: until launch, the public gets a coming-soon page and
 * nothing else — not the SPA shell, not the JS bundle, not a single asset.
 *
 * Runs as Vercel Routing Middleware (../middleware.ts), so it sits in front of
 * every URL the deployment answers on — app.getkaru.io, karu-web.vercel.app
 * and every preview — ahead of the static files and the SPA rewrite. Checking
 * in the browser instead would be decoration: the bundle would still ship and
 * anyone could skip the check in devtools.
 *
 * The team gets past it by entering SITE_ACCESS_CODE once per browser, which
 * sets a signed HttpOnly cookie. The cookie is an HMAC keyed by the code, so
 * rotating the code revokes every pass already handed out.
 *
 * Fails closed: with no code configured, or one short enough to guess, nobody
 * gets in rather than everybody.
 *
 * To launch, delete ../middleware.ts and this folder.
 */

export const ACCESS_PATH = '/__access';
export const COOKIE_NAME = '__Host-karu_access';
export const MIN_CODE_LENGTH = 12;
export const PASS_TTL_S = 30 * 24 * 60 * 60;

/**
 * The response to send, or undefined to let the request through to the app
 * (Routing Middleware treats "no response" as continue).
 */
export async function gate(
  request: Request,
  accessCode: string | undefined,
  now: number = Date.now(),
): Promise<Response | undefined> {
  const code = accessCode && accessCode.length >= MIN_CODE_LENGTH ? accessCode : undefined;
  const url = new URL(request.url);

  if (url.pathname === ACCESS_PATH && request.method === 'POST') {
    return unlock(request, code, now);
  }

  const passed = code !== undefined && (await hasValidPass(request, code, now));

  if (url.pathname === ACCESS_PATH) {
    // A bookmarkable way in that opens the form; once in, it just goes home.
    return passed ? redirect('/') : page(request, { formOpen: true, next: '/' });
  }

  return passed ? undefined : page(request, { next: url.pathname + url.search });
}

async function unlock(request: Request, code: string | undefined, now: number): Promise<Response> {
  let attempt = '';
  let next = '/';
  try {
    const form = await request.formData();
    attempt = String(form.get('code') ?? '');
    next = String(form.get('next') ?? '/');
  } catch {
    // Not a form post — treated as a wrong code below.
  }
  const target = localPath(next, request.url);

  if (!code) {
    console.error(
      `[gate] SITE_ACCESS_CODE is unset or shorter than ${MIN_CODE_LENGTH} characters — team access is disabled.`,
    );
  }
  if (!code || !(await sameSecret(attempt, code))) {
    return page(request, { status: 403, formOpen: true, failed: true, next: target });
  }

  const expires = Math.floor(now / 1000) + PASS_TTL_S;
  const response = redirect(target);
  response.headers.append(
    'Set-Cookie',
    `${COOKIE_NAME}=${await issuePass(code, expires)}; Path=/; Max-Age=${PASS_TTL_S}; HttpOnly; Secure; SameSite=Lax`,
  );
  return response;
}

/**
 * `next` as a path on this site, or home. Returned as a path rather than an
 * absolute URL so the redirect can't depend on which hostname the middleware
 * was handed; leading slashes are collapsed so it can never read as //host.
 */
function localPath(next: string, base: string): string {
  try {
    const target = new URL(next, base);
    if (target.origin === new URL(base).origin && target.pathname !== ACCESS_PATH) {
      return `/${target.pathname.replace(/^\/+/, '')}${target.search}`;
    }
  } catch {
    // Unparseable — go home.
  }
  return '/';
}

function redirect(path: string): Response {
  return new Response(null, { status: 303, headers: { Location: path, 'Cache-Control': 'no-store' } });
}

function page(
  request: Request,
  view: { status?: number; formOpen?: boolean; failed?: boolean; next: string },
): Response {
  // Same rule as the app's i18n: French if the browser leads with it.
  const locale: Locale = request.headers.get('accept-language')?.trim().toLowerCase().startsWith('fr')
    ? 'fr'
    : 'en';
  const html = renderComingSoon({
    locale,
    action: ACCESS_PATH,
    next: view.next,
    formOpen: view.formOpen ?? false,
    failed: view.failed ?? false,
  });
  return new Response(html, {
    status: view.status ?? 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // One URL is the app for the team and this page for everyone else, so
      // nothing in between may keep a copy of either.
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
      // Scriptless page: tighter than the app's CSP in vercel.json.
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

// Pass format: v1.<expiry, unix seconds>.<hex HMAC-SHA256 of "v1.<expiry>">.

async function issuePass(code: string, expires: number): Promise<string> {
  return `v1.${expires}.${await hmac(code, `v1.${expires}`)}`;
}

async function hasValidPass(request: Request, code: string, now: number): Promise<boolean> {
  const match = readCookie(request.headers.get('cookie'), COOKIE_NAME)?.match(/^v1\.(\d{1,12})\.([0-9a-f]{64})$/);
  if (!match || Number(match[1]) * 1000 <= now) return false;
  return timingSafeEqual(match[2], await hmac(code, `v1.${match[1]}`));
}

function readCookie(header: string | null, name: string): string | undefined {
  for (const part of header?.split(';') ?? []) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return undefined;
}

const encoder = new TextEncoder();

const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');

async function hmac(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message)));
}

/** Compares digests, so neither timing nor length says anything about the code. */
async function sameSecret(attempt: string, code: string): Promise<boolean> {
  const [a, b] = await Promise.all(
    [attempt, code].map(async (s) => hex(await crypto.subtle.digest('SHA-256', encoder.encode(s)))),
  );
  return timingSafeEqual(a, b);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
