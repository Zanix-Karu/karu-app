import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createRemoteJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JWTPayload,
} from 'jose';

/**
 * Verifies Supabase-issued access tokens.
 *
 * Newer Supabase projects sign access tokens with an asymmetric key (ES256)
 * published at the project's JWKS endpoint; older projects use HS256 with the
 * shared JWT secret. We branch on the token header so both work:
 *   - ES256/RS256 → verified against the remote JWKS (cached by jose, no
 *     secret needed in our env)
 *   - HS256       → verified locally with SUPABASE_JWT_SECRET
 *
 * In both cases the audience must be 'authenticated' — Supabase's marker for
 * an end-user session token (rejects anon/service tokens used as bearers).
 */
@Injectable()
export class TokenVerifierService {
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly config: ConfigService) {}

  async verify(token: string): Promise<JWTPayload> {
    let alg: string | undefined;
    try {
      alg = decodeProtectedHeader(token).alg;
    } catch {
      throw new UnauthorizedException('Malformed token');
    }

    try {
      if (alg === 'HS256') {
        const secret = this.config.get<string>('SUPABASE_JWT_SECRET');
        if (!secret) {
          throw new UnauthorizedException(
            'HS256 token received but SUPABASE_JWT_SECRET is not configured',
          );
        }
        const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
          algorithms: ['HS256'],
          audience: 'authenticated',
        });
        return payload;
      }

      const { payload } = await jwtVerify(token, this.getJwks(), {
        algorithms: ['ES256', 'RS256'],
        audience: 'authenticated',
      });
      return payload;
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private getJwks() {
    if (!this.jwks) {
      const url = this.config.getOrThrow<string>('SUPABASE_URL');
      this.jwks = createRemoteJWKSet(new URL(`${url}/auth/v1/.well-known/jwks.json`));
    }
    return this.jwks;
  }
}
