import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Thin wrapper around a service-role Supabase client.
 *
 * The service-role key bypasses RLS, so this client must NEVER be reachable
 * from the browser — all access goes through the NestJS API, which is the
 * authorization boundary. Use `db` for typed table access.
 */
@Injectable()
export class SupabaseService implements OnModuleInit {
  private client!: SupabaseClient;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const url = this.config.getOrThrow<string>('SUPABASE_URL');
    const serviceKey = this.config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY');
    this.client = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  /** Service-role client (bypasses RLS). Server-side only. */
  get db(): SupabaseClient {
    return this.client;
  }
}
