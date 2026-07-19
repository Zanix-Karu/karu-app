import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { SupabaseAuthGuard } from './supabase-auth.guard';
import { RolesGuard } from './roles.guard';

/**
 * Registers global guards: every route requires a valid Supabase token
 * (unless marked @Public), and @Roles(...) is enforced on top. Order matters —
 * auth runs before roles so req.user exists when RolesGuard reads it.
 */
@Module({
  providers: [
    { provide: APP_GUARD, useClass: SupabaseAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
