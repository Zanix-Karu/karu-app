import { gate } from './gate/gate';

/**
 * Vercel Routing Middleware. Vercel runs it before every request to this
 * deployment, ahead of the static files and the SPA rewrite in vercel.json;
 * Vite's dev server never loads it, so `pnpm dev` is unaffected.
 *
 * It exists only for the pre-launch coming-soon gate (see gate/gate.ts). To
 * launch, delete this file and gate/.
 */
export default function middleware(request: Request) {
  return gate(request, process.env.SITE_ACCESS_CODE);
}

// Vercel's default for middleware.ts is Edge, which its build now flags as
// deprecated. The gate only uses web-standard APIs, so either runtime works.
export const config = { runtime: 'nodejs' };
