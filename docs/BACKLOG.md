# Karu: Pending Backlog

**Updated:** 6 September 2026
**Repo:** `~/Developer/karu-app` (web = `apps/web`, API = `apps/api`, DB = Supabase `oxjkrfcwffdkycrstnxz`).
**Companion:** the full QA record is in [`QA-FINDINGS-2026-09-01.md`](./QA-FINDINGS-2026-09-01.md). This file is the forward-looking "what's still to do" list: what's pending from that QA plus the new requests from 6 Sept.

All copy must pass the humanise bar: British English, no em dashes, plain and direct. Every user-facing string goes through i18n (en + fr), never hardcoded.

---

## Status snapshot

- **Shipped in code and on `main`** (PR #27, commit `d11aa3e`): feedback reporting, the Karu assistant panel, the build-version footer, humanised copy, VER-2, A11Y-3, and everything from the earlier `#25` pass (security fixes, radius, carousel, privacy pages, branded email templates, unread-chat alerts).
- **API (Render `karu-api`):** deployed from `main` and live. Feedback endpoints respond.
- **Supabase:** migration `0025` (feedback table + bucket) applied.
- **Web (Vercel `karu-web`):** NOT live yet. See P0 below.

---

## P0: current deploy blocker

### DEPLOY-1 · Vercel web build is failing / not shipping
- **What:** `app.getkaru.io` still serves the pre-merge build. The Render API and Supabase migration are live, but the Vercel web deploy for `karu-web` has not shipped, so none of the merged web work (assistant, feedback page, version footer, humanised copy, VER-2, A11Y-3) is visible yet.
- **Proven:** the merged commit builds clean through Vercel's exact steps locally, including a cold fresh-`node_modules` build (`pnpm install --frozen-lockfile` → `tsc -b` → `vite build`). So the failure is Vercel-side config, not the code.
- **Most likely causes** (check in the `karu-web` project settings):
  - **Node version**: set to **22.x**; `package.json` `engines` requires `>=22`. A pin to 18/20 fails the build.
  - **Production env vars**: a missing var, or one that references a Secret that no longer exists (Vercel fails the build on that).
- **Fix path:** read the failed build log (needs the Vercel MCP connector reconnected to the `karu10`/`zanix.karu` account, which owns `karu-web`), fix the config, redeploy. The API + DB are already ready, so this is the only thing between here and everything being live.

---

## New requests: 6 September 2026

### REQ-1 · Tell a user an account already exists on signup
- **What:** when someone tries to create an account with an email that already has one, make it clear (in-app message, and/or an email to that address saying "you already have a Karu account").
- **Where:** `apps/web/src/screens/AuthScreen.tsx` (signup path), Supabase Auth.
- **Note / nuance:** Supabase deliberately returns an obfuscated response on duplicate signup to prevent account enumeration, so the *in-app* message can't reliably say "this email is taken" without weakening that. The clean pattern is the **email** route: Supabase can send a "you already have an account" notice to the address, and the in-app copy stays neutral ("Check your inbox to continue"). Decide which trade-off we want. Pairs with REQ-5 and REQ-7.

### REQ-2 · Filters apply automatically on selection
- **What:** on `/search`, applying a filter shouldn't need a separate "Apply filters" click. Each change (car type, driver, transmission, seats, max price) should apply immediately.
- **Where:** `apps/web/src/screens/SearchScreen.tsx`: today sidebar changes only update `draft`; `commit(draft)` runs on the Apply button. Call `commit` from each `onChange` (debounce the numeric inputs, seats/max price, so it doesn't fire on every keystroke). Keep the button as a no-op fallback or remove it.

### REQ-3 · Country-code selector on phone fields
- **What:** phone inputs should have a country-code picker (default **+237** Cameroon) rather than a free-text field.
- **Where:** vendor signup phone + WhatsApp (`AuthScreen`), profile phone (`ProfileScreen`). Store E.164. A small country-code `Select` + national-number input, combined on submit.

### REQ-4 · Fix the backend emailing service  *(= EMAIL-1)*
- **What:** transactional emails (booking requested/confirmed/rejected) are likely failing. The seed `email_log` shows real Resend errors: *"the domain getkaru.io is not verified"* and a rate-limit.
- **Where:** Resend dashboard (verify `getkaru.io`, SPF/DKIM), `NotificationsService` + `EMAIL_FROM`/`RESEND_API_KEY`. Add send-failure logging/retry so bounces are visible, not swallowed.

### REQ-5 · Customer with an existing email creating a vendor account
- **What:** a signed-out customer whose email already has a (customer) account tried to create a **vendor** account with the same email and it broke. The intended path is to **upgrade the existing account to also be a provider**, not create a duplicate.
- **Where:** `AuthScreen` signup + `ListYourCarScreen` (there's already a "convert customer to provider" branch for a signed-in customer). The gap is the signed-out case: detect the existing account, prompt sign-in, then run the upgrade (`POST /vendors`) rather than a fresh signUp. Ties to REQ-1 and REQ-8.

### REQ-6 · Handover verification code (Uber-Eats style)
- **What:** at car handover, confirm the exchange with a short code, like a food-delivery handover. The customer holds the code; the vendor enters it to confirm the car was handed over (moves the booking to `in_progress`). Optionally a second code at return.
- **Where:** new `handover_code` (and maybe `return_code`) on `bookings` (migration); generate on confirm; expose to the customer on the booking detail; a vendor "Confirm handover" action that requires the code and drives the `confirmed → in_progress` transition (extend `bookings.service` transition rules). Same idea in reverse for `in_progress → completed` at return if wanted.

### REQ-7 · Normalise and trim whitespace in email/inputs (exploit guard)
- **What:** an email like `m fnalaha @ g mail . com` (spaces inside/around) must be normalised, or it slips past validation and can create duplicate/again-spoofed accounts.
- **Where:** server-side (the real boundary) and client. Trim, strip internal whitespace, lowercase the email before signUp / signIn / vendor create; validate strictly. Do the same for other free-text identity fields. Add this to the API DTOs (a transform) so it holds regardless of client.

### REQ-8 · "List your car" must not show for customers
- **What:** a signed-in **customer** should not see the "List your car" nav item and should have no access to `/list-your-car`.
- **Where:** `apps/web/src/lib/roles.ts`: remove `/list-your-car` from `NAV.customer` and from `ALLOWED.customer`. Keep it for **guest** (still the acquisition path for new providers) and leave vendors on their dashboard.
- **Decision to confirm:** this removes the only in-app entry for a customer to *upgrade* to a provider. If we still want that upgrade path, put it somewhere provider-appropriate (e.g. an option in Profile) rather than the customer nav. Coordinate with REQ-5.

### REQ-9 · Refactor vendor suspension
- **What:** define and implement what suspension actually does. Today `verified → suspended` flips a status; it doesn't spell out the effect on **existing confirmed bookings** and **in-progress bookings**, and it captures no reason.
- **Where:** `packages/shared` (`VENDOR_TRANSITIONS`), `apps/api/src/admin` + `vendors.service`, and the admin Vendors tab. Add: a **suspension reason** (stored, shown to the vendor); rules for **new bookings blocked** while suspended; a policy for **existing bookings** (e.g. confirmed bookings stand, or are flagged/cancelled with notice; in-progress trips continue). Write the reasoning down in the doc before coding, then enforce it.

- **Also:** send automated emails to the vendor on **suspension and reinstatement** (with the reason), and to affected customers when a suspension changes their booking. Uses the REQ-4 email service.

### REQ-10 · Archive finished bookings
- **What:** completed / cancelled / rejected bookings should move to an archived view rather than cluttering the active lists, for customer, vendor and admin.
- **Where:** likely no schema change (derive "archived" from terminal statuses), or an `archived_at` if we want manual archiving. Add an "Archived" tab/filter on `BookingsScreen`, the vendor booking list, and the admin bookings tab. Keep active lists to `requested / confirmed / in_progress`.

### REQ-11 · Translation for all text
- **What:** make sure every user-facing string is translated (en + fr), with no missing keys and no hardcoded English.
- **Where:** audit `apps/web/src` for literal strings and for `t('...')` keys that resolve to the key (missing translation). Add a translation-completeness check (the marketing repo has a `check:translations` script to model). Cameroon is francophone-majority, so treat fr as first-class, not an afterthought.

### REQ-12 · Outdated-document renewal alert
- **What:** alert when a vendor's documents are expiring or expired (insurance, carte grise, roadworthiness). `vendor_documents.expires_at` already exists and is indexed.
- **Where:** vendor dashboard banner ("your insurance expires in N days" / "expired: renew to keep listings live"), the admin overview attention panel, and optionally auto-flag/deactivate a car when a required document has expired. A scheduled job (or on-read check) computes the window from `expires_at`.

---

## Carried-over pending (from the QA findings)

- **CONTENT-1 · Real car photos.** Listings still use mismatched stock (a red Hyundai on the "Corolla", Bugatti/Lambo thumbnails). The single biggest credibility item. Data, not code.
- **Auth email branding (the "Supabase Auth" sender).** Branded templates are in the repo, but on hosted Supabase the sender name and template must be set in the dashboard, with a custom SMTP sender (Resend). Overlaps with REQ-4.
- **DB dashboard/ops:** apply migration `0022` (move `btree_gist` out of `public`), enable Supabase **leaked-password protection**.
- **PAY-1 · Payments.** No real gateway wired (manual only). MTN Mobile Money / Orange Money (or Stripe) before taking real money. Launch decision.
- **GAP first-looks (untested, verify with a real user):** rate limiting / abuse throttling on auth + booking + messages; storage-bucket access rules (can one vendor read another's private docs?); driver + delivery booking variants; API input fuzzing; deeper keyboard/focus accessibility through the booking and auth flows; the waitlist/marketing repo's privacy + admin flows.

---

## Suggested order

1. **DEPLOY-1**: get the web build live (nothing else the team shipped is visible until this lands).
2. **REQ-4 / auth-email branding**: email is currently broken; it underpins REQ-1, confirmations, and notifications.
3. **REQ-7, REQ-1, REQ-5, REQ-8**: the signup/identity cluster (whitespace normalisation, duplicate-email handling, customer→vendor collision, hiding "List your car" from customers). Do them together; they touch the same auth/roles code.
4. **REQ-2, REQ-3**: search auto-apply and the phone country code (quick UX wins).
5. **REQ-12, REQ-9**: document-expiry alerts and the suspension refactor (vendor trust + ops).
6. **REQ-6**: handover verification code (new booking-flow feature).
7. **REQ-10, REQ-11**: booking archiving and the full translation pass.
8. Carried-over: **CONTENT-1** photos, migration `0022`, leaked-password toggle, then the **GAP** first-looks and **PAY-1**.
