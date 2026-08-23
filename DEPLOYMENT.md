# Deploying Karu to getkaru.io

Two subdomains, two deploy targets:

| Subdomain | What | Host |
| --- | --- | --- |
| `app.getkaru.io` | `apps/web` (Vite SPA) | Vercel |
| `api.getkaru.io` | `apps/api` (NestJS, Docker) | Railway / Render / Fly.io |

The database is the Supabase project `karu-app`
(`oxjkrfcwffdkycrstnxz`, eu-west-3, org zanix.karu@gmail.com). Recreated on
2026-08-23 — the original project (`oxjkrfcwffdkycrstnxz`) was deleted — and
the full schema 0001–0019 is applied, with `schema_migrations` versions
matching the file numbering, so a plain `supabase db push` applies future
migrations cleanly.

> **Migration renumbering (2026-08-12):** two files used to share version
> `0014`, which breaks `db push` with a duplicate-key error on
> `schema_migrations`. They are now `0014_fix_signup_trigger_search_path`,
> `0015_role_grants`, `0016_driver_and_delivery`, `0017_booking_messages`.
> Production never applied any of them, so a plain `supabase db push` works.
> Any environment that applied role grants or driver/delivery out-of-band
> needs `supabase migration repair --status applied 0015 0016` first (the
> local dev DB has already been repaired).

## 1. API → api.getkaru.io

The image is fully self-contained (see `apps/api/Dockerfile`). On Railway or
Render: **New service → Deploy from GitHub → Zanix-Karu/karu-app**, set the
Dockerfile path to `apps/api/Dockerfile` (build context = repo root).

Environment variables (all of them — the app fails fast if one is missing):

| Var | Value |
| --- | --- |
| `SUPABASE_URL` | `https://oxjkrfcwffdkycrstnxz.supabase.co` |
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
| `VITE_SUPABASE_URL` | `https://oxjkrfcwffdkycrstnxz.supabase.co` |
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

## 6. Booking chat (in-app messages)

Migration 0017 adds `booking_messages` + `booking_message_reads` and ships
the in-app chat between customer and vendor, replacing the support-email
relay as the primary channel (the `/bookings/:id/message` relay endpoint
still exists).

The mechanisms that keep the marketplace's contact-isolation rule intact:

- **Server-side redaction** — phone numbers, emails and WhatsApp/Telegram
  links are stripped from customer/vendor messages *before storage*
  (`apps/api/src/messages/redact.ts`); the `redacted` flag on the row tells
  both the sender and the admin console it happened. Dates, times and XAF
  prices pass through untouched.
- **Admin oversight** — Operations → Chats lists every conversation with
  unread counts and a "redactions" badge; opening one lands on the booking,
  where the admin posts into the same thread as **Karu Support**.
- **Email nudges** — the other party gets a "new message" email via Resend,
  throttled to one per recipient per booking per hour (checked against
  `email_log`, template `chat_message_notice`). No Resend key → logged as
  `failed`, chat unaffected.
- **RLS defense in depth** — thread reads are limited to the booking's
  parties; there is no client INSERT policy, so writes only happen through
  the API (where redaction lives).

Nothing to configure at go-live beyond pushing the migration; the email
nudges reuse `RESEND_API_KEY`/`EMAIL_FROM` and link to `WEB_APP_URL`.

## CI

`.github/workflows/ci.yml` runs on every PR and push to main: typecheck
(api + web), unit tests, and both production builds. Merge only on green.
