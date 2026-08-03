import { supabase } from './supabase';

const BASE = import.meta.env.VITE_API_URL;

/**
 * Calls the Karu API, attaching the current Supabase access token as a bearer
 * token. The API verifies it and resolves the user's role server-side.
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const res = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** Paged list response, as returned by GET /vehicles. */
export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
