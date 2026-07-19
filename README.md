# Karu — Application

The product application for **Karu**, a verified car-rental marketplace for
Cameroon (Douala / Yaoundé). This repo is separate from the marketing website.

> **Current slice: data model + auth.** The Supabase schema and the NestJS
> auth/role layer are the foundation; feature modules (vendors, vehicles,
> bookings) are implemented as a thin working vertical on top of it. The web app
> is a minimal shell awaiting the real UI.

## Architecture

```
Browser (React + Vite + Tailwind)
   │  - Supabase JS for AUTH ONLY (login / signup / OTP)
   │  - all data via fetch → API, with the Supabase JWT as a bearer token
   ▼
NestJS API  ──────────────────────────── authorization boundary
   │  - verifies the Supabase JWT locally (HS256)
   │  - resolves role from `profiles`, enforces @Roles guards
   │  - owns all business logic (booking state machine, pricing, …)
   │  - talks to Postgres with the service-role key (bypasses RLS)
   ▼
Supabase (Postgres + Auth + Storage)
   - Auth issues tokens; Postgres holds the data; RLS is defense-in-depth
```

**Why a backend in front of Supabase?** A marketplace with real money (Mobile
Money escrow), trust/verification, and a booking state machine wants its logic
server-side and not exposed via an auto-generated DB API. Supabase still earns
its keep for auth (incl. phone OTP, important for Cameroon) and storage.

## Layout

| Path                   | What                                                        |
| ---------------------- | ----------------------------------------------------------- |
| `supabase/migrations/` | The data model — enums, tables, triggers, RLS               |
| `apps/api/`            | NestJS API (auth guards + feature modules)                  |
| `apps/web/`            | Vite + React + Tailwind shell (drop UI here)                |
| `packages/shared/`     | TS enums/types shared by api + web (mirror of the DB enums) |

## Data model (high level)

`profiles` (1:1 with `auth.users`, holds `role`) → `vendors` → `vehicles` →
`bookings` → `payments`, with `vendor_documents` (verification) and `reviews`
(two-sided). The booking lifecycle is a DB enum and a transition map in
`@karu/shared` that the API enforces:

```
requested ─► confirmed ─► in_progress ─► completed
    │            │
    ├─► rejected └─► cancelled
    └─► cancelled
```

## Getting started

```bash
pnpm install

# 1. Database — point the Supabase CLI at a project (or `supabase start` locally)
#    and apply migrations:
supabase db push          # or run the files in supabase/migrations/ in order

# 2. Configure env
cp .env.example .env       # fill SUPABASE_URL / SERVICE_ROLE_KEY / JWT_SECRET / ANON_KEY

# 3. Run
pnpm dev                   # api (:3000) + web (:5173) together
# or individually:
pnpm dev:api
pnpm dev:web
```

Health check: `GET http://localhost:3000/api/health`.

## API surface (current)

| Method & path                  | Auth        | Purpose                              |
| ------------------------------ | ----------- | ------------------------------------ |
| `GET /api/health`              | public      | Liveness                             |
| `GET /api/profiles/me`         | any user    | Current profile                      |
| `PATCH /api/profiles/me`       | any user    | Update profile                       |
| `GET /api/vendors`             | public      | Verified-vendor directory            |
| `POST /api/vendors`            | any user    | Register as a vendor (→ role vendor) |
| `GET /api/vendors/me`          | vendor      | Own vendor record                    |
| `GET /api/vehicles`            | public      | Browse active listings (filterable)  |
| `GET /api/vehicles/:id`        | public      | Listing detail                       |
| `GET /api/vehicles/mine`       | vendor      | Own listings                         |
| `POST /api/vehicles`           | vendor      | Create a listing                     |
| `POST /api/bookings`           | customer    | Request a booking                    |
| `GET /api/bookings/mine`       | any user    | Bookings scoped to role              |
| `PATCH /api/bookings/:id/status` | any user  | Advance the booking state machine    |

## Stack

React + Vite + Tailwind · NestJS · Supabase (Postgres + Auth + Storage) ·
pnpm workspaces · TypeScript end to end.
