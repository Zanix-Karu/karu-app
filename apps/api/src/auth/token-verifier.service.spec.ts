import { describe, expect, it } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { SignJWT } from 'jose';
import { TokenVerifierService } from './token-verifier.service';

const SECRET = 'test-jwt-secret-0123456789abcdef0123456789abcdef';
const KEY = new TextEncoder().encode(SECRET);

const makeConfig = (values: Record<string, string | undefined>) =>
  ({
    get: (k: string) => values[k],
    getOrThrow: (k: string) => {
      const v = values[k];
      if (v === undefined) throw new Error(`Missing config ${k}`);
      return v;
    },
  }) as never;

const signHs256 = (opts: { sub?: string; aud?: string; exp?: string } = {}) => {
  let jwt = new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '1h');
  if (opts.sub !== undefined) jwt = jwt.setSubject(opts.sub);
  if (opts.aud !== undefined) jwt = jwt.setAudience(opts.aud);
  return jwt.sign(KEY);
};

describe('TokenVerifierService (HS256 path)', () => {
  const verifier = new TokenVerifierService(
    makeConfig({ SUPABASE_JWT_SECRET: SECRET, SUPABASE_URL: 'https://x.supabase.co' }),
  );

  it('accepts a valid token and returns its payload', async () => {
    const token = await signHs256({ sub: 'user-1', aud: 'authenticated' });
    const payload = await verifier.verify(token);
    expect(payload.sub).toBe('user-1');
  });

  it('rejects a token with the wrong audience (e.g. an anon key)', async () => {
    const token = await signHs256({ sub: 'user-1', aud: 'anon' });
    await expect(verifier.verify(token)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an expired token', async () => {
    const token = await signHs256({ sub: 'user-1', aud: 'authenticated', exp: '-1h' });
    await expect(verifier.verify(token)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a tampered token', async () => {
    const token = await signHs256({ sub: 'user-1', aud: 'authenticated' });
    const [h, p] = token.split('.');
    const forged = `${h}.${p}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
    await expect(verifier.verify(forged)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects garbage that is not a JWT at all', async () => {
    await expect(verifier.verify('not-a-jwt')).rejects.toThrow('Malformed token');
  });
});

describe('TokenVerifierService (misconfiguration)', () => {
  it('rejects HS256 tokens when no JWT secret is configured', async () => {
    const verifier = new TokenVerifierService(
      makeConfig({ SUPABASE_URL: 'https://x.supabase.co' }),
    );
    const token = await signHs256({ sub: 'user-1', aud: 'authenticated' });
    await expect(verifier.verify(token)).rejects.toThrow(/SUPABASE_JWT_SECRET/);
  });
});
