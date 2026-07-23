# Deploying Karu to getkaru.io

Two subdomains, two deploy targets:

| Subdomain | What | Host |
| --- | --- | --- |
| `app.getkaru.io` | `apps/web` (Vite SPA) | Vercel |
| `api.getkaru.io` | `apps/api` (NestJS, Docker) | Railway / Render / Fly.io |

The database is the existing Supabase project `karu-app`
(`zxvshmicnufitxquogsw`, eu-west-3) — nothing to deploy there beyond
migrations (`supabase/migrations/`, all applied through 0013).

## 1. API → api.getkaru.io

The image is fully self-contained (see `apps/api/Dockerfile`). On Railway or
Render: **New service → Deploy from GitHub → Zanix-Karu/karu-app**, set the
Dockerfile path to `apps/api/Dockerfile` (build context = repo root).

Environment variables (all of them — the app fails fast if one is missing):

| Var | Value |
| --- | --- |
| `SUPABASE_URL` | `https://zxvshmicnufitxquogsw.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Dashboard → Project Settings → API keys (never in git) |
| `SUPABASE_JWT_SECRET` | optional — only needed for legacy HS256 tokens; new tokens verify via JWKS |
| `CORS_ORIGIN` | `https://app.getkaru.io` |
| `RESEND_API_KEY` | from Resend (optional until email goes live; failures are logged, not fatal) |
| `EMAIL_FROM` | `Karu <bookings@getkaru.io>` (verify the domain in Resend first) |

The platform's `PORT` is respected automatically. Health check path:
`/api/health`.

DNS: `CNAME api → <host-provided domain>` in the getkaru.io zone, then attach
the custom domain in the host's dashboard (TLS is automatic).

## 2. Web → app.getkaru.io

Vercel → **Add New Project → import Zanix-Karu/karu-app** → set **Root
Directory to `apps/web`**. `apps/web/vercel.json` already configures the
workspace install/build commands and the SPA fallback rewrite.

Environment variables:

| Var | Value |
| --- | --- |
| `VITE_API_URL` | `https://api.getkaru.io` |
| `VITE_SUPABASE_URL` | `https://zxvshmicnufitxquogsw.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | anon key (safe to expose; RLS-gated) |

DNS: `CNAME app → cname.vercel-dns.com`, then add `app.getkaru.io` as the
project domain in Vercel.

## 3. Order of operations for go-live

1. Deploy the API, paste env vars, confirm `GET https://api.getkaru.io/api/health` returns ok.
2. Deploy the web app pointing `VITE_API_URL` at it.
3. Set `CORS_ORIGIN=https://app.getkaru.io` on the API (and redeploy) so the
   browser can call it.
4. Verify the loop on production: sign up → browse seeded cars → request →
   confirm from the admin account → check `email_log`.

## CI

`.github/workflows/ci.yml` runs on every PR and push to main: typecheck
(api + web), unit tests, and both production builds. Merge only on green.
