# Deploying Karu to getkaru.io

Two subdomains, two deploy targets:

| Subdomain | What | Host |
| --- | --- | --- |
| `app.getkaru.io` | `apps/web` (Vite SPA) | Vercel |
| `api.getkaru.io` | `apps/api` (NestJS, Docker) | Railway / Render / Fly.io |

The database is the existing Supabase project `karu-app`
(`zxvshmicnufitxquogsw`, eu-west-3) — nothing to deploy there beyond
migrations: run `supabase db push` against it so the hosted schema matches
`supabase/migrations/` (it was last pushed at 0013; 0014–0015 add role
grants and driver/delivery).

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
| `SUPPORT_EMAIL` | where booking messages are relayed (defaults to `support@getkaru.io`) |
| `STRIPE_SECRET_KEY` | optional — set together with the webhook secret to turn on card deposits |
| `STRIPE_WEBHOOK_SECRET` | optional — from the Stripe webhook endpoint; the API refuses to boot with only one of the pair |
| `WEB_APP_URL` | `https://app.getkaru.io` — where Stripe Checkout returns the customer (falls back to first `CORS_ORIGIN`) |

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

## 4. Email go-live (Resend)

The code path is done — booking emails (EN/FR) and message relays send via
Resend and every attempt lands in `email_log`. Until the key is set, sends are
recorded there as `failed` and nothing else breaks. To turn it on:

1. Resend → **Domains → Add domain → getkaru.io**, add the DKIM/SPF records it
   gives you to the DNS zone, wait for Verified.
2. Create an API key (sending-only) and set `RESEND_API_KEY` on the API.
3. Set `EMAIL_FROM=Karu <bookings@getkaru.io>` and `SUPPORT_EMAIL`.
4. Smoke test: make a booking request in production, then
   `select recipient, template, status, error from email_log order by created_at desc limit 5;`
   — every row should be `sent`. The `failed` rows keep the error message.

## 5. Card deposits go-live (Stripe)

`StripeCardProvider` charges the 15% deposit through Stripe Checkout (XAF,
zero-decimal) and marks it `held` only when the **signed** webhook says the
session was paid. With no keys set, the honest manual placeholder ships
instead — nothing is charged and nothing pretends to be. To turn it on:

1. Stripe dashboard → API keys → create a **restricted key** with Checkout
   Session write access → `STRIPE_SECRET_KEY`.
2. Developers → Webhooks → Add endpoint
   `https://api.getkaru.io/api/payments/webhook`, subscribed to
   `checkout.session.completed`, `checkout.session.expired`,
   `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed` → copy the signing secret to
   `STRIPE_WEBHOOK_SECRET`. **Set both vars or neither** — the API refuses to
   boot half-configured, because charging without the webhook means money
   taken but never marked received.
3. Set `WEB_APP_URL=https://app.getkaru.io` so Checkout returns customers to
   their booking page.
4. Test with Stripe test keys first: `stripe listen --forward-to
   localhost:3000/api/payments/webhook`, pay with `4242 4242 4242 4242`, and
   confirm the booking's payment flips to “Deposit received”.

Mobile Money (MTN MoMo / Orange Money) is the next adapter behind the same
seam once an aggregator is chosen — nothing outside `payments/provider.ts`
changes.

## CI

`.github/workflows/ci.yml` runs on every PR and push to main: typecheck
(api + web), unit tests, and both production builds. Merge only on green.
