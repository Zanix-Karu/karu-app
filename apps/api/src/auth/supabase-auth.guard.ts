import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import type { UserRole } from '@karu/shared';
import { SupabaseService } from '../supabase/supabase.service';
import { IS_PUBLIC_KEY } from './decorators';
import type { AuthUser } from './auth.types';

/**
 * Verifies the Supabase-issued access token on the Authorization header.
 *
 * Supabase signs access tokens with HS256 using the project's JWT secret, so we
 * verify locally (no network round-trip). The token's `sub` is the user id; we
 * then resolve the application role from the `profiles` table. The role is NOT
 * trusted from the token, since a client controls its own user_metadata.
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
    private readonly supabase: SupabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(req);
    if (!token) throw new UnauthorizedException('Missing bearer token');

    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, this.config.getOrThrow<string>('SUPABASE_JWT_SECRET'), {
        algorithms: ['HS256'],
      }) as jwt.JwtPayload;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const userId = payload.sub;
    if (!userId) throw new UnauthorizedException('Token missing subject');

    const { data: profile, error } = await this.supabase.db
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (error || !profile) throw new UnauthorizedException('No profile for user');

    const user: AuthUser = {
      id: userId,
      email: (payload.email as string) ?? null,
      role: profile.role as UserRole,
    };
    req.user = user;
    return true;
  }

  private extractToken(req: Request): string | null {
    const header = req.headers.authorization;
    if (!header) return null;
    const [scheme, value] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && value ? value : null;
  }
}
