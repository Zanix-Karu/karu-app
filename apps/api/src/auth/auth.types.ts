import type { UserRole } from '@karu/shared';

/** The authenticated principal attached to each request by SupabaseAuthGuard. */
export interface AuthUser {
  /** auth.users.id (== profiles.id) */
  id: string;
  email: string | null;
  role: UserRole;
}

declare module 'express' {
  interface Request {
    user?: AuthUser;
  }
}
