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
