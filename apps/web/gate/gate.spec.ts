import { describe, expect, it, vi } from 'vitest';
import { ACCESS_PATH, COOKIE_NAME, PASS_TTL_S, gate } from './gate';

const CODE = 'test-code-not-a-real-one';
const ORIGIN = 'https://app.getkaru.io';
const NOW = Date.UTC(2026, 8, 27, 12);

const get = (path: string, headers: Record<string, string> = {}) =>
  new Request(ORIGIN + path, { headers });

const post = (code: string, next = '/') =>
  new Request(ORIGIN + ACCESS_PATH, {
    method: 'POST',
    body: new URLSearchParams({ code, next }),
  });

/** Unlocks with the right code and returns the `name=value` cookie pair. */
async function pass(code = CODE, now = NOW) {
  const res = await gate(post(code), code, now);
  return res!.headers.get('set-cookie')!.split(';')[0];
}

describe('coming-soon gate', () => {
  it('answers every path with the coming-soon page, assets included', async () => {
    for (const path of ['/', '/search', '/cars/42', '/assets/index-D1sw9V6N.js', '/robots.txt']) {
      const res = await gate(get(path), CODE, NOW);
      expect(res?.status).toBe(200);
      expect(res?.headers.get('content-type')).toBe('text/html; charset=utf-8');
      expect(await res!.text()).toContain('Coming soon');
    }
  });

  it('keeps the page out of caches and search indexes', async () => {
    const res = await gate(get('/'), CODE, NOW);
    expect(res?.headers.get('cache-control')).toBe('no-store');
    expect(res?.headers.get('x-robots-tag')).toBe('noindex');
    expect(res?.headers.get('content-security-policy')).toContain("default-src 'none'");
  });

  it('ships no script, so the strict CSP holds', async () => {
    const html = await (await gate(get('/'), CODE, NOW))!.text();
    expect(html).not.toMatch(/<script/i);
  });

  it('leads with French when the browser does', async () => {
    const html = await (await gate(get('/', { 'accept-language': 'fr-CM,fr;q=0.9,en;q=0.8' }), CODE, NOW))!.text();
    expect(html).toContain('<html lang="fr">');
    expect(html.indexOf('Bientôt disponible')).toBeLessThan(html.indexOf('Coming soon'));
  });

  it('lets a valid pass through to the app', async () => {
    const cookie = await pass();
    expect(await gate(get('/bookings', { cookie: `other=1; ${cookie}` }), CODE, NOW)).toBeUndefined();
  });

  it('unlocks with the right code: hardened cookie, back to the page asked for', async () => {
    const res = await gate(post(CODE, '/cars/42?from=search'), CODE, NOW);
    expect(res?.status).toBe(303);
    expect(res?.headers.get('location')).toBe('/cars/42?from=search');

    const cookie = res!.headers.get('set-cookie')!;
    expect(cookie.startsWith(`${COOKIE_NAME}=v1.`)).toBe(true);
    for (const attr of ['Path=/', `Max-Age=${PASS_TTL_S}`, 'HttpOnly', 'Secure', 'SameSite=Lax']) {
      expect(cookie).toContain(attr);
    }
    expect(cookie).not.toContain(CODE);
  });

  it('refuses a wrong code without setting anything', async () => {
    const res = await gate(post('test-code-not-a-real-onf'), CODE, NOW);
    expect(res?.status).toBe(403);
    expect(res?.headers.get('set-cookie')).toBeNull();
    expect(await res!.text()).toContain('That code isn’t right.');
  });

  it('never redirects off-site after unlocking', async () => {
    for (const next of ['https://evil.example/', '//evil.example', '/\\evil.example', 'javascript:alert(1)', ACCESS_PATH]) {
      const location = (await gate(post(CODE, next), CODE, NOW))!.headers.get('location');
      expect(location).toBe('/');
    }
    // A same-origin path that would read as protocol-relative is collapsed.
    const location = (await gate(post(CODE, `${ORIGIN}//evil.example`), CODE, NOW))!.headers.get('location');
    expect(location).toBe('/evil.example');
  });

  it('fails closed, and says so in the logs, when no code is configured', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await gate(get('/'), undefined, NOW))?.status).toBe(200);
    expect((await gate(post(''), undefined, NOW))?.status).toBe(403);
    expect((await gate(post(''), '', NOW))?.status).toBe(403);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('SITE_ACCESS_CODE'));
    error.mockRestore();
  });

  it('fails closed when the configured code is short enough to guess', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await gate(post('karu2026'), 'karu2026', NOW);
    expect(res?.status).toBe(403);
    expect(res?.headers.get('set-cookie')).toBeNull();
    error.mockRestore();
  });

  it('rejects forged, tampered, expired and revoked passes', async () => {
    const cookie = await pass();
    const [, expires, sig] = cookie.split('=')[1].split('.');
    const rejected = async (c: string, code = CODE, now = NOW) =>
      (await gate(get('/', { cookie: c }), code, now)) !== undefined;

    expect(await rejected(`${COOKIE_NAME}=v1.9999999999.${'0'.repeat(64)}`)).toBe(true);
    expect(await rejected(`${COOKIE_NAME}=v1.${Number(expires) + 86400}.${sig}`)).toBe(true);
    expect(await rejected(`${COOKIE_NAME}=v1.0${expires}.${sig}`)).toBe(true);
    expect(await rejected(cookie, CODE, NOW + (PASS_TTL_S + 1) * 1000)).toBe(true);
    expect(await rejected(cookie, 'a-rotated-test-code')).toBe(true);
    expect(await rejected(cookie.replace(COOKIE_NAME, 'karu_access'))).toBe(true);
  });

  it('opens the form at the access path, and sends a pass-holder home', async () => {
    const locked = await gate(get(ACCESS_PATH), CODE, NOW);
    expect(await locked!.text()).toContain('<details open>');

    const cookie = await pass();
    const res = await gate(get(ACCESS_PATH, { cookie }), CODE, NOW);
    expect(res?.status).toBe(303);
    expect(res?.headers.get('location')).toBe('/');
  });

  it('escapes the path it echoes back into the form', async () => {
    const html = await (await gate(get('/search?city=douala&from=2026-10-01'), CODE, NOW))!.text();
    expect(html).toContain('value="/search?city=douala&#38;from=2026-10-01"');
  });
});
