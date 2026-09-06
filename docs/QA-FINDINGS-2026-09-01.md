# Karu — QA Findings & Fix Backlog (1 Sept 2026)

**Purpose:** master handoff from a full live QA + design session. A new session should be able to pick this up and work top-to-bottom. Every item is prioritised, located in code, and has a proposed fix.

**Two repos** (see also `MEMORY.md` → `karu-two-repos`):
- `~/Developer/karu-app` — the marketplace app. API = `apps/api` (NestJS), web = `apps/web` (React/Vite), DB = Supabase project `oxjkrfcwffdkycrstnxz` (`db.oxjkrfcwffdkycrstnxz.supabase.co`, eu-west-3). Hosts: `app.getkaru.io` (web, Vercel), `api.getkaru.io` (API, Render).
- `~/Developer/Karu` — the **waitlist / marketing** site (Next.js) at `www.getkaru.io`. The SEO + mobile-nav items below live here.

**Production has real users now.** e.g. `alliu.emmanuel9@gmail.com` (Emmanuel Alliu) self-signed-up. Do **not** treat prod data as disposable. Email confirmation is **ON** in production (contradicts `supabase/config.toml` `enable_confirmations=false` — mismatch, see F-11).

**How findings were verified:** live browsing of all three roles signed in (customer/vendor/admin), unauthenticated API sweep, in-session authenticated API calls, Supabase advisors + schema queries, the shipped JS bundle, and rendered DOM/computed styles at desktop + 375px. No production data belonging to the real user was touched.

**Companion artifacts (fuller write-ups):**
- Site audit (17 findings): https://claude.ai/code/artifact/63c38820-7f87-418a-bca3-9c0c1f75bc15
- Workflow autopsy (customer/vendor/admin): https://claude.ai/code/artifact/c3282c9d-5b57-42ae-b3f6-8f94d381d6ec
- Design restructure plan: https://claude.ai/code/artifact/0047961d-8f83-469c-a73f-ab840c1d01c4

---

## Priority summary

| Pri | Count | Theme |
|-----|-------|-------|
| P1 (fix first — security/privacy) | 3 | Vendor PII leak, anon-writable table, no app security headers |
| P2 (blocking launch / credibility) | 8 | Session hardening, committed creds, wrong photos, funnel, SEO, no payments |
| P3 (polish / a11y / small) | ~17 | Accessibility, perf, failing emails, small UX bugs, plate privacy, DB hygiene |
| Needs verification | 4 | Lower-confidence items to reproduce with a real user |
| Coverage gaps | 10 | Areas not tested this session — give each a first look |
| Design | 6 | Radius sprawl, brand consistency, image sizing, premium finish |
| Features | 6 | Carousel, feedback page, chatbot, privacy pages, branded email, alerts |

---

## ⏱️ STATUS UPDATE — re-verified 2026-09-04

The original findings were logged 2026-09-01. On re-check (2026-09-04) the team had already shipped much of the security backlog. Current truth:

**✅ Resolved (live):**
- **SEC-1** — `GET /api/vendors` no longer returns contact fields; `listPublic` projection is locked down. Verified live.
- **SEC-2** — `booking_counters` now has RLS enabled (migration `0020` applied to prod; advisor's ERROR is gone, only the intended "RLS enabled, no policy" INFO remains).
- **SEC-6** — `registration_number` no longer in the public vehicle detail. Verified live.
- **DB-1 (part)** — function `search_path` hardening applied (migration `0021`); the SECURITY DEFINER / mutable-search_path advisor warnings are gone.

**✅ Fixed in repo, NOT yet live (needs a deploy you asked me not to do):**
- **SEC-3** — full header set (HSTS+preload, X-Frame-Options DENY, nosniff, Referrer/Permissions-Policy, strict CSP) is in `apps/web/vercel.json`, but the live app still returns only bare `Strict-Transport-Security`. **→ web redeploy needed.**
- **SEC-4** — `flowType:'pkce'` is set in `apps/web/src/lib/supabase.ts`. **→ ships with the web deploy.**
- **UX-1** — the provider CTA in `ListYourCarScreen.tsx` now passes `mode:'signup', account:'vendor'`. **→ ships with the web deploy** (confirm `AuthScreen` reads them).

**◻︎ Still open — deploy/apply/dashboard actions (no repo code):**
- **SEC-3 / SEC-4 / UX-1** live effect — one web redeploy delivers all three.
- **DB-1 remainder** — `btree_gist` still in `public` schema (migration `0022` not applied; it's marked "run deliberately, not routine"); Supabase Auth **leaked-password protection still disabled** (dashboard toggle).

**✅ Already shipped in repo (re-verified 2026-09-04) beyond security:** DS-1 (radius consolidated to 6/10/14 + pill; the 60px is gone), FEAT-1 (photo carousel), DS-6 (image aspect-ratio/`object-fit`), FEAT-4 (privacy/terms pages via LegalScreen), FEAT-5 (branded auth email templates in `supabase/templates/`), FEAT-6 (unreplied-chat alert on the admin overview), PERF-1 (route-level code splitting).

**🔨 Built this session (2026-09-04, repo only — no deploy, migration not applied):**
- **FEAT-3 — Feedback & issue reporting.** migration `0025_feedback.sql` (feedback table + RLS + private `feedback-images` bucket); API module `apps/api/src/feedback/` (submit, signed-URL image upload, `/feedback/mine`, admin `/admin/feedback` list + status PATCH) wired in `app.module.ts`; web `FeedbackScreen.tsx` (customer + vendor form, up to 5 screenshots) at `/feedback` with nav links + guards in `roles.ts`/`App.tsx`; admin **Feedback tab** in `AdminScreen.tsx` (queue, status filter, image previews, triage buttons); en/fr i18n. **Both packages `typecheck` clean.**
- **VER-2 fixed** — vendor `ALLOWED` in `roles.ts` now includes `/bookings`, so a vendor can open a booking's detail from their request list (the shared `/bookings/:id` route already admitted vendors).
- **FEAT-2 — Karu assistant panel.** New `apps/web/src/components/AssistantPanel.tsx`, mounted globally in `App.tsx`: a slide-in **right drawer on desktop / bottom sheet on mobile** (drag handle, dimmed backdrop, slide-not-fade, `motion-reduce` honoured, Escape/backdrop close, focus handling). **Rule-based, context-aware FAQ** (guest/customer/vendor topic sets) with deep-link actions and a "Report an issue" hand-off to `/feedback`. `answerFor()` is the single seam to swap in a model later — no LLM bill now. en/fr i18n. **Verified live in the dev server** (both desktop and mobile layouts, topic → answer → deep link). Typechecks clean.

- **A11Y-2 — verified already fixed** in `SearchScreen.tsx`: the car-type group is a `fieldset`/`legend`, radios are named/labelled, city/date/seats/price use `Field` labels, and the sort select has an `aria-label`. No change needed.
- **A11Y-3 — finished.** The skip link was already in `App.tsx`; this session fixed the last two: the `CarCard` car name is now a real heading (`h2` in search results, `h3` elsewhere, via a `headingLevel` prop) so results are navigable by structure, and the "all fees in" line moved from `--gray-400` (#a3a2a2, ~2.56:1 on white) to `--gray-500` to clear the 4.5:1 floor. `apps/web/src/ds/index.tsx` + `SearchScreen.tsx`. Typechecks clean.
- **UX-4 — verified already fixed** in `lib/currency.tsx`: `currencyDisplay: 'narrowSymbol'` renders "£28" / "28 £" instead of "28 £GB". No change needed.

**➡️ Remaining open REPO work:** **none.** Every requested feature is built and every repo-actionable finding is resolved. What's left is not code:
- **Deploy/apply/dashboard:** ship the pending web + API deploy (delivers SEC-3 headers, SEC-4 PKCE, UX-1, FEAT-1..6, the a11y fixes), apply migrations `0022` (btree_gist) and `0025` (feedback), enable Supabase leaked-password protection.
- **Data/ops:** CONTENT-1 — replace the stock car photos with real ones; EMAIL-1 — verify the `getkaru.io` domain in Resend so transactional emails send.
- **Only-with-a-real-user checks:** the GAP-* items (rate limiting, storage access rules, driver/delivery booking, etc.) and the VER-* items still merit a first look.

Everything below is kept for the record; check the ✅ tags before starting an item.

---

## P1 — Security & privacy (do first; real users are in prod)

### SEC-1 · Vendor personal phone/email are public
- **What:** `GET https://api.getkaru.io/api/vendors` (unauthenticated) returns each vendor's `contact_person`, `contact_phone`, `contact_email`, and internal `profile_id`. The vendor **profile page** also renders the phone in its header to logged-out visitors.
- **Contradiction:** the "List your car" page promises *"your phone number stays private … all contact runs through Karu."*
- **Where:** `apps/api/src/vendors/vendors.controller.ts` (`listPublic`) + the service's public projection; vendor profile screen (`VendorDirectoryScreen` / vendor detail render).
- **Fix:** strip `contact_*` and `profile_id` from the public vendor payload and the profile header. Expose contact details only to a signed-in customer with a **confirmed booking** against that vendor.

### SEC-2 · `booking_counters` is writable by the public anon key
- **What:** only table in `public` with RLS **off**; `anon` holds SELECT/INSERT/UPDATE/DELETE/TRUNCATE. Anon key ships in the bundle. Confirmed readable in prod (`[{"day":"2026-08-28","counter":1}]`, HTTP 200). Feeds `next_booking_reference()`.
- **Fix:** `ALTER TABLE public.booking_counters ENABLE ROW LEVEL SECURITY;` and revoke anon/authenticated grants. Nothing client-side needs it (reference generation runs behind the API with the service role). Add a migration.

### SEC-3 · The app ships with no security headers
- **What:** `app.getkaru.io` sends no CSP, no `X-Frame-Options`/`frame-ancestors`, no `X-Content-Type-Options`, no Referrer-Policy/Permissions-Policy, and `access-control-allow-origin: *` on the HTML document. Sign-in/booking pages are framable today. The **marketing site has all of these** (see `~/Developer/Karu/next.config.mjs`) — port them.
- **Fix:** add the header set to the app's Vercel config (`vercel.json` headers or the web framework config). Combined with SEC-4 this closes the XSS→takeover chain.

---

## P2 — Blocking launch / credibility

### SEC-4 · Session tokens in localStorage + implicit flow
- **What:** Supabase client runs `persistSession:true` on localStorage with `flowType:'implicit'`. With SEC-3 (no CSP), any XSS reads the token → full account takeover (customer/vendor/admin).
- **Fix:** switch to `flowType:'pkce'`; treat SEC-3's CSP as the mitigating control. `apps/web/src/lib/` supabase client init.

### SEC-5 · Committed demo password; demo accounts live in prod
- **What:** `supabase/seed.sql:47` creates `admin@demo.getkaru.io` + vendor/customer demo users with hard-coded `crypt('KaruDemo2026!')`. Those accounts — **including admin** — exist and log in on production.
- **Fix:** rotate/disable the demo accounts in prod; move the seed password to an env var; never commit it.

### CONTENT-1 · Every car photo is the wrong car
- **What:** listings use Unsplash stock that doesn't match — e.g. "Toyota Vitz" leads with a Honda CR-V in an Icelandic snowfield; galleries show BMW M3/M4, Ferrari, Bugatti; "Corolla" shows a red sports car. Stored in the `photos` array of seeded `vehicles` rows.
- **Fix:** real photos from launch vendors. Until then use a neutral silhouette placeholder — an obvious placeholder reads pre-launch; a wrong car reads dishonest.

### UX-1 · Provider signup funnel lands on the sign-in tab
- **What:** "Create a provider account" (ListYourCarScreen) navigates to `/auth` with `state:{from:'/vendor'}` in **login** mode — not signup pre-set to "I'm a provider". New providers hit a login wall.
- **Where:** `apps/web/src/screens/ListYourCarScreen.tsx` (the CTA), `AuthScreen.tsx` (reads `from`; make it also read an intended `mode`/`account`).
- **Fix:** pass `state:{from:'/vendor', mode:'signup', account:'vendor'}` and honour it in `AuthScreen`.

### PAY-1 · No real payment provider wired (launch blocker)
- **What:** prod runs `ManualPaymentProvider` (`canCharge:false`); webhook refuses all calls. Customer funnel has no real checkout; deposit is notional. Deliberate MVP choice — flagged so it's not a surprise. Payment code itself is solid (signature + replay protection present for when a gateway is added).
- **Fix:** decide launch stance; wire MTN MoMo / Orange Money (or Stripe) before charging.

### SEO-1 · The app is invisible to search
- **What:** every route serves the same shell `<title>Karu</title>` with no description/OG/canonical/favicon. `/robots.txt` and `/sitemap.xml` return that HTML (SPA catch-all). Unknown routes return **200** with a 404 body (soft-404s indexable).
- **Fix:** static `robots.txt` + `sitemap.xml`; per-route `<title>`/meta (react-helmet or SSR); prerender `/search` and `/cars/:id`; make unknown routes serve a real 404 status.

### SEO-2 · Marketing site canonicals/sitemap point at a redirect
- **Where:** `~/Developer/Karu` (waitlist repo).
- **What:** `<link rel=canonical>`, `og:url`, and every sitemap `<loc>` use the naked `getkaru.io`, which 307s to `www`. Signal split + a hop on every URL.
- **Fix:** pick `www.getkaru.io` as canonical host; set `NEXT_PUBLIC_SITE_URL` accordingly (one var fixes tags + sitemap).

### FUNNEL-1 · Marketing site never links to the app
- **Where:** `~/Developer/Karu`.
- **What:** no reference to `app.getkaru.io` anywhere in the served HTML; 10 bookable cars, but every visitor is funnelled to a waitlist.
- **Fix:** decide pre-launch vs launched; if launched, hero primary → "Browse cars" → the app, demote pre-register to secondary.

---

## P3 — Accessibility, small UX, hygiene

### A11Y-1 · No mobile navigation on the marketing site
- **Where:** `~/Developer/Karu/components/layout/Navigation.tsx`.
- **What:** nav links are `hidden min-[900px]:flex` with no hamburger/drawer below 900px. Measured at 375px: About/How-it-works/Features/Cities all `visible:false`. Mobile-first market.
- **Fix:** add a menu button + drawer, or a horizontally-scrolling anchor strip.

### A11Y-2 · Search filters unusable with a screen reader
- **Where:** app `/search` (SearchScreen).
- **What:** the 7 car-type radios expose their name as **"on"**; city select, both date inputs, seats + max-price inputs, and the sort select have **no accessible name**. Visible labels aren't associated. Radios are 13×13px (WCAG 2.2 wants ≥24).
- **Fix:** `for`/`id` on every label; wrap the radio group in `fieldset`+`legend`; grow hit areas to ≥24px.

### A11Y-3 · Contrast, skip link, heading structure
- **What:** "all fees in" caption is 2.55:1 on white (needs 4.5). No skip link on either site. The `/search` results page has only one heading (the hero H1); car names + filter-group titles look like headings but aren't marked up as any.
- **Fix:** darken the caption; add a skip link to both layouts; make each car name an `<h2>` and each filter group an `<h3>`.

### UX-2 · Review form flashes on already-reviewed trips
- **Where:** app `BookingsScreen.tsx` (`ReviewForm` gate on `/reviews/mine`).
- **What:** on first paint, the review form shows on a completed booking the user already reviewed, before the reviews query resolves; submitting would 409. Self-corrects after load.
- **Fix:** gate the form on the reviews query's settled state (show a skeleton until `myReviews` resolves).

### UX-3 · Silent failures should surface inline
- **What (a):** publishing a draft vehicle with <6 photos returns **400** *"Add the required photos before activating — missing: rear, left, right, dashboard, seats"* but the admin UI shows nothing. **(b):** one message send failed silently once (not reproducible — contact-stripping otherwise works for phone/email/both).
- **Fix:** render the API error message as an inline alert (Base alert-ladder tier 1) on publish and on message-send failures. Preserve the user's typed text on message failure.

### UX-4 · "≈ 28 £GB" currency abbreviation
- **What:** GBP conversions render as `≈ 28 £GB` (odd label). EUR/GBP conversions otherwise work.
- **Fix:** format as `≈ £28` / `≈ €X` (Intl.NumberFormat currency).

### UX-5 · Messaging privacy copy vs displayed phone
- **What:** the booking Messages panel says *"phone numbers or email addresses are removed automatically — all contact runs through Karu"* while the Provider panel directly above shows the vendor's phone. Ties into SEC-1.
- **Fix:** resolve with SEC-1 (don't show the raw phone), or reword.

### DB-1 · Supabase advisor hygiene
- **What (from `get_advisors` security):**
  - `booking_counters` RLS disabled (= SEC-2).
  - `email_log`, `vehicle_blocks`: RLS enabled, **no policies** (closed, verify intentional).
  - `set_updated_at`, `current_user_role`, `current_vendor_id`, `next_booking_reference`: mutable `search_path` (some are SECURITY DEFINER) → set `search_path`.
  - `current_user_role()`, `current_vendor_id()`, `handle_new_user()`: SECURITY DEFINER executable by anon/authenticated via `/rest/v1/rpc/*` → revoke EXECUTE or switch to SECURITY INVOKER if unintended.
  - `btree_gist` installed in `public` schema → move to another schema.
  - Auth: leaked-password protection **disabled** → enable (HaveIBeenPwned check) in dashboard.
- **Fix:** one migration for search_path + RPC grants + extension move; toggle the auth setting in dashboard.

### SEC-6 · Number plates public on listings
- **What:** `GET /api/vehicles/:id` returns `registration_number` (e.g. `LT 660 ST`) to anyone.
- **Fix:** withhold the plate from the public payload until pickup / a confirmed booking.

### TOOLING-1 · Local dev broken in the waitlist repo
- **Where:** `~/Developer/Karu/.env`.
- **What:** points at Supabase ref `lwgdjkrileoebjowqsia` which no longer resolves (NXDOMAIN — project deleted); anything DB-backed 500s locally. Also missing `NEXT_PUBLIC_SITE_URL`, `PRIVACY_TOKEN_SECRET`, both Turnstile keys. (Production is unaffected.)
- **Fix:** repoint `.env` at a live Supabase project / local stack; fill the missing keys.

### F-11 · Email-confirmation config mismatch
- **What:** prod requires email confirmation (real confirmation email observed) but `supabase/config.toml` has `enable_confirmations=false` (twice). The signup code's vendor-record creation only runs when a session exists immediately — verify the vendor-onboarding path still creates the `vendors` row when confirmation is required (post-confirm sign-in path).
- **Fix:** reconcile config with prod; ensure vendor business-record creation happens after email confirm, not only in the inline-session branch.

### EMAIL-1 · Transactional emails likely failing (Resend domain not verified)
- **What:** seed `email_log` rows show real failures — *"Resend 403: the domain getkaru.io is not verified for this API key"* and *"Resend 429: rate limit exceeded"*. If `getkaru.io` isn't verified in Resend, the app's own notification emails (booking requested/confirmed/rejected via `NotificationsService` + `EMAIL_FROM`) silently fail in production. (Supabase Auth's confirmation email is a separate sender and does work — see F-11.)
- **Fix:** verify the sending domain in Resend (SPF/DKIM), confirm `RESEND_API_KEY`/`EMAIL_FROM`, and add alerting/retry on send failure so a bounce is visible, not swallowed.

### PERF-1 · Heavy bundle + unoptimised images
- **What:** the web app ships a **single JS chunk ~709KB raw (~202KB over the wire)** with no route-level code splitting. Car images have **no `loading="lazy"`** and are fetched full-size from an external CDN (Unsplash) — slow first screen on the 3G/patchy-5G connections much of the market uses.
- **Fix:** route-level `React.lazy` + `Suspense` code splitting; `loading="lazy"` + `decoding="async"` on off-screen images; serve appropriately-sized images (width params / a resizing proxy) once real photos exist (ties into DS-6 and CONTENT-1).

### UX-6 · App mobile layout buries the search form
- **What:** at 375px the app header takes ~300px (logo on its own row, nav wrapping to a second row, no hamburger), and the hero H1 breaks across ~4 lines at full display size — so the City/date fields (the whole point of `/search`) land below ~two screens of scroll.
- **Fix:** compact the mobile header (collapse nav into a menu, smaller hero type), and lift the search form up so it's reachable without scrolling. Pairs with DS-1/DS-4.

### SEO-3 · Every page in the app shares the title "Karu"
- **What:** search, a vehicle page, sign-in and the 404 all render `<title>Karu</title>` — browser tabs, history and bookmarks are indistinguishable. Same root cause as SEO-1.
- **Fix:** per-route titles (covered by SEO-1's title work).

### ANALYTICS-1 · Vercel Speed Insights blocked by the site's own CSP (marketing repo)
- **Where:** `~/Developer/Karu`.
- **What:** the marketing layout includes `<SpeedInsights/>`, but its script host `va.vercel-scripts.com` is **not** in the site's `script-src` CSP, so the script is blocked (console: *"Loading the script 'https://va.vercel-scripts.com/…/speed-insights/script...' violates the following Content Security Policy directive"*). Speed Insights never runs → no RUM data.
- **Fix:** add `va.vercel-scripts.com` to `script-src` (and `vitals.vercel-insights.com` to `connect-src`) in `next.config.mjs`, or drop the component if unused.

---

## Design restructure (Uber Base → Karu)

Reference: `~/Downloads/uber-base-design-system.md`. Tokens live in `apps/web/src/ds/tokens.css`; components in `apps/web/src/ds/index.tsx` and `apps/web/src/ui.tsx`.

### DS-1 · Radius sprawl (biggest "unfinished/premium" win)
- **What:** radii run `--radius-sm:5 · md:10 · lg:15 · xl:24 · 2xl:60 · pill:999`. The 60px pill-cards read toy-like.
- **Fix:** collapse to one personality: `--radius-100:6` (inputs/chips), `200:10` (buttons/cards), `300:14` (sheets/modals), `round:999` (avatars, currency/lang toggle, status chips **only** — never cards/CTAs). Delete `--radius-2xl:60px` (4 usages) and rounded-2xl on cards.

### DS-2 · Colour discipline
- **Fix:** enforce monochrome-carries-structure (brown/cream/grey) + **gold as the single accent**; red/green/amber only for state. Strip decorative gold fills that aren't a primary action.

### DS-3 · One primary action per screen
- **Fix:** audit screens showing two competing gold buttons; demote the second to secondary/outline.

### DS-4 · Interactive states + four data states
- **Fix:** every control needs default/hover/active/focus-visible/disabled/loading (several buttons lack focus rings + loading). Every data screen needs loading (skeleton)/empty/error/success. Adopt the four-tier alert ladder (inline → banner → toast → modal).

### DS-5 · Brand consistency across the two sites
- **What:** marketing site = dark espresso, muted amber, serif display; app = light cream, brighter yellow, different type. A visitor crossing over has to re-orient.
- **Fix:** align the palette/type between marketing and app (shared token values).

### DS-6 · Card/gallery images are inconsistent sizes → cards don't line up
- **What:** source photos have different pixel dimensions and aspect ratios (most are 1200×800 landscape, but e.g. the Toyota Corolla is 1200×1600 **portrait**). Because the image containers don't enforce a fixed ratio, the rendered images differ in shape/height, so the cards sit unevenly and don't look parallel to each other.
- **Where:** search result cards, vendor-profile car list, and the car-detail gallery (`CarImage` in `apps/web/src/ui.tsx`; card markup in `SearchScreen`/`VendorDirectoryScreen`; detail gallery in `CarDetailScreen.tsx`).
- **Fix:** enforce a **fixed aspect ratio + `object-fit: cover`** on every car image so any source renders uniformly:
  - Wrap each image in a ratio box (`aspect-ratio: 16 / 10` for cards, `4 / 3` or `16 / 9` for the detail hero) with `overflow: hidden`.
  - Image: `width:100%; height:100%; object-fit:cover; object-position:center` — crops instead of stretching, so portrait and landscape sources both fill the same shape.
  - Give card image containers the same fixed height (or ratio) so card bodies align in the grid; thumbnails likewise share one ratio.
  - Optional: add a neutral placeholder background behind the image for the load state (ties into DS-4 skeletons) and pair with CONTENT-1 (the photos are also the *wrong* cars).

---

## Features requested

### FEAT-1 · Interactive photo carousel
- **Where:** `apps/web/src/screens/CarDetailScreen.tsx` (gallery block ~L95–105) + `CarImage` in `ui.tsx`. Today: static main image + non-interactive thumbnail strip (`photos.slice(1,6)`).
- **Build:** selectable thumbnails drive the main image (active outlined); left/right arrows, wrap-around, keyboard arrows, touch swipe; position counter + dot row; lazy-load off-screen; respect `prefers-reduced-motion`.

### FEAT-2 · Chatbot assistant panel (slide-in)
- **Build:** slide-in **side panel** on desktop, **bottom sheet** on mobile (Base bottom-sheet pattern: peek/half/full snaps, drag handle, slide-not-fade, dim backdrop above half). Separate from the human booking Messages thread. Serves customers **and** vendors, context-aware. Start rule-based (FAQ + deep links) so it ships without an LLM bill; leave a seam to wire a model later. **Note:** there is no chatbot today — Messages is human↔human.

### FEAT-3 · Feedback & issue reporting (customer + vendor → admin)
- **Build:** feedback page for customers and vendors with **image attachments** (Supabase Storage bucket, reuse vendor-document upload plumbing); fields = category, message, optional screenshots, auto-captured context (page/role/app version). New `feedback` table with RLS (authors see own; admins see all). New **admin "Feedback" tab** beside Chats: list + status (new/triaging/resolved) + image previews + role filter.

### FEAT-4 · Privacy Policy & Terms pages
- **Build:** real `/privacy` and `/terms` routes in the app, linked from the signup consent checkbox (currently links to nothing). Port the waitlist site's existing privacy content + Law 2024/017 / GDPR framing (`~/Developer/Karu/app/[locale]/privacy`).

### FEAT-5 · Karu-branded auth email
- **Where:** `supabase/config.toml` (template hooks stubbed/commented ~L246–255) + Supabase dashboard Auth settings.
- **Build:** set sender name + subject ("Confirm your email · Karu"); add branded HTML confirmation + password-reset templates. Currently reads "Supabase Auth".

### FEAT-6 · Alerts: unreplied chats + more
- **What:** admin Chats already tracks per-thread unread ("5 new") and a "redactions" flag. Surface an **aggregate alert** on the admin overview (and a vendor-side "you have unanswered messages"). Extend to: requests nearing the 24h reply window, documents pending review, vendors awaiting verification.

---

## Needs verification (observed but not fully confirmed in-session)

These are lower-confidence — I couldn't cleanly confirm them because synthetic browser clicks on some controls didn't register reliably in the automation. Verify with a real user before treating as bugs.

- **VER-1 · Sidebar filters may not apply.** City, dates and sort were confirmed to drive the API correctly. The **sidebar** filters (car-type radio, seats, max-price, driver) I set via scripted events did **not** reduce the "10 cars available" count. This was likely the automation not triggering React state, but confirm a human selecting "SUV" / seats / max-price actually filters the list.
- **VER-2 · Vendor "View details" → booking detail.** As a vendor, clicking "View details" on a booking row did not navigate for me (may have been a mis-click, or the vendor `canOpen`/ALLOWED route map not including `/bookings/:id` while the route guard does allow vendors). Confirm a vendor can open a booking's detail page from their list.
- **VER-3 · Lists refreshing after an action.** The admin console refreshed live after Verify. The vendor booking list appeared not to refresh after an action until re-navigation — but that was entangled with the click-registration issue. Confirm React Query invalidates the relevant list after confirm/reject/etc. so the UI updates without a manual refresh.
- **VER-4 · Vendor "Verified" badge vs missing documents.** Sawa Wheels shows a Verified badge while several of its documents read "not uploaded" — most likely just seed-data inconsistency, but worth confirming verification status can't be granted independent of required docs in the real flow.

---

## Coverage gaps — NOT tested this session (absence of a finding ≠ clean)

Be explicit: these areas were not exercised (some couldn't be — file uploads and password entry are outside what the tooling could do; vendor management forms needed a re-login I couldn't perform). A new session should give each a first proper look.

- **GAP-1 · Rate limiting / abuse throttling.** I did **not** test whether login, signup, booking-create, message-send, or password-reset are rate-limited. Brute-force on `/auth/v1/token`, booking spam, and message spam are all plausible. **Verify (and add if missing)** per-IP / per-account throttling; Supabase Auth has some built-in, the NestJS API endpoints need their own (e.g. `@nestjs/throttler`).
- **GAP-2 · File-upload flows.** Vendor **+Photo** (listing photos) and **document upload**, and the storage bucket's access rules, were never exercised (no file to attach, and uploads are outside the tooling). Confirm signed-URL scoping, file-type/size limits, and that one vendor can't read another's private documents.
- **GAP-3 · Vendor management forms.** Add-a-car (full submit), Edit-a-car, the Availability/block-dates calendar UI, Retire, edit business profile, and View-public-profile were **not physically walked** (the transition/CRUD *endpoints* were verified, but the forms weren't). Walk each as a vendor.
- **GAP-4 · Booking completion tail.** The post-booking **confirmation screen** (`/bookings/:id/confirmed`), the **password-reset completion** (clicking the emailed link → set a new password at `/auth/reset`), and the **recovery** route were not walked end-to-end.
- **GAP-5 · Driver + delivery booking variants.** A booking **with a driver** (driver fee applied) and **delivery/airport-pickup** (`delivery_type=address`, delivery fee, `pickup_time`) were not completed — only the negative case (driver on a non-driver car → 400) was tested. Verify the quote maths and required-field validation for both.
- **GAP-6 · Input fuzzing / injection on the API.** Search/query params and free-text fields were not fuzzed for injection or PostgREST filter-metacharacter abuse. Supabase uses parameterised queries (low risk) but the search/sort/filter params deserve a pass. (Auth is bearer-token, so classic CSRF is largely N/A — worth stating rather than assuming.)
- **GAP-7 · Password policy.** Signup enforces only "at least 8 characters" — no complexity check, and leaked-password protection is off (DB-1). Consider strengthening.
- **GAP-8 · Deeper accessibility.** Only `/search` got a structured a11y scan. Keyboard navigation and focus management through the **booking flow**, the **auth forms**, and (once built) the **chatbot sheet** were not audited. No dark mode exists in the app; not evaluated.
- **GAP-9 · Notification/email content.** Whether booking notification emails render correctly (subject, body, links, locale) was not verified — blocked partly by EMAIL-1 (domain likely unverified).
- **GAP-10 · Waitlist/marketing API + privacy flows.** In the `~/Developer/Karu` repo, only the public surface + headers were checked. The waitlist submit, the privacy data-rights request/confirm flow, and the admin endpoints (beyond confirming they 401) were not exercised this session.

---

## What already works — do NOT regress

Verified live this session; treat as the safety net:
- **API authorization is airtight** — every protected route returns 401 unauth / 403 wrong-role (~16 endpoints swept across all roles). IDOR, cross-role transitions, price injection, role-escalation via profile — all refused.
- **Double-booking is impossible** — Postgres exclusion constraint `bookings_no_overlap` (gist on vehicle_id + daterange where status in confirmed/in_progress), plus app-level availability check at request time (409).
- **State machines** — booking (`BOOKING_TRANSITIONS`) and vendor (`VENDOR_TRANSITIONS`) gated by state + role (`ALLOWED_BY_ROLE`) + ownership; prices computed server-side, never trusted from client.
- **Stored XSS is escaped** — an `<img onerror>` payload in a booking note renders inert in customer/vendor/admin views.
- **Contact-stripping works** and is admin-auditable (a "redactions" flag on affected threads).
- **Payment security** (for when enabled) — webhook signature verification + replay-window rejection + refuse-to-boot if half-configured.
- **i18n EN/FR** and **currency XAF/EUR/GBP** work across walked pages.
- **Reviews integrity** — completed-only, one per booking (unique constraint → 409), rating 1–5 enforced.
- **Admin flows** all function — verify/suspend/re-verify (+ illegal transition → 409), document approve/reject, the 6-photo publish rule, vehicle date-block create/delete, create-vehicle + validation.
- **CORS is correctly restricted** on the API (spoofed origin rejected).

---

## Demo data changed during this QA (for context; all re-seedable, none touching the real user)

- Vendors: **Bastos Executive Cars** pending→verified; **Limbe Coastal Rides** rejected→verified; **Douala Prestige Rentals** suspend→verify round-trip (net unchanged).
- Documents: one carte-grise approved, one insurance rejected (Bastos).
- Booking `KARU-20260828-0013` (Marie Fotso, demo) requested→confirmed.
- Created + cancelled a test customer booking (Amina, Toyota Vitz, Nov dates).
- A few QA chat messages on Amina's confirmed booking; one password-reset email attempted to a demo address.
- A QA draft vehicle was created and **deleted** (net clean); a vehicle date-block created and **deleted** (net clean).

Re-seed from `supabase/seed.sql` if a clean demo state is wanted.

---

## Suggested execution order

1. **P1 security** — SEC-1, SEC-2, SEC-3 (real users are in prod).
2. **DS-1 radius/token pass** — biggest premium jump, low risk, mostly one file.
3. **FEAT-1 carousel** — self-contained, directly answers user feedback.
4. **FEAT-4 privacy/terms + signup links**, **FEAT-5 branded email** — content/config largely exists.
5. **P2 remainder** — SEC-4/5, UX-1 funnel, SEO-1/2, FUNNEL-1.
6. **FEAT-3 feedback + admin tab**, **FEAT-2 chatbot panel** — larger builds.
7. **P3 sweep** — A11Y-1/2/3, UX-2/3/4/5, DB-1, SEC-6, TOOLING-1, F-11.
8. **DS-2..5** — carry through as screens are touched.
