import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { UserRole } from '@karu/shared';
import { SupabaseService } from '../supabase/supabase.service';
import { IS_PUBLIC_KEY } from './decorators';
import { TokenVerifierService } from './token-verifier.service';
import type { AuthUser } from './auth.types';

/**
 * Authenticates requests via the Supabase access token on the Authorization
 * header (see TokenVerifierService for how tokens are verified). The token's
 * `sub` is the user id; the application role is then resolved from the
 * `profiles` table. The role is NOT trusted from the token, since a client
 * controls its own user_metadata.
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly supabase: SupabaseService,
    private readonly verifier: TokenVerifierService,
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

    const payload = await this.verifier.verify(token);

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
