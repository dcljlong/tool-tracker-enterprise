# Tool tracker: move to Supabase

Goal: retire the Emergent FastAPI + MongoDB server. The tool tracker runs on the **Site-Day Supabase project**
(`pmwjaabhbewlxuewcrbr`, Sydney) so one login covers Site-Day and the tool tracker. The website stays on Vercel
(or Cloudflare Pages later). One codebase, two plans and two looks (`brand`: `long_line` personal, `site_day` crew).

## Status

| Step | What | Status |
|---|---|---|
| 1 | Database tables, company separation (RLS), private photo/PDF storage | **Done 9 Nov 2026** – applied to Site-Day project |
| 2 | Sign-up and login (Supabase Auth, shared with Site-Day) | **Built 10 Nov** – on branch preview, needs Davy's sign-in test |
| 3 | Switch the screens from the FastAPI server to Supabase (12 pages, ~50 API calls) | **Built 10 Nov** – `frontend/src/lib/supabaseApi.js` |
| 4 | Stripe: checkout, customer portal, webhook → `tt_subscriptions` | **Code + tests done 10 Nov**; billing migration applied; functions not deployed until a Stripe sandbox is connected |
| 5 | Invite team members (edge function, service role, seat limit) | **Built 10 Nov** – `tt-team` edge function deployed |
| 6 | Reminders (tag expiry, overdue returns) – scheduled edge function | After 4 |
| 7 | Copy live data from MongoDB + photos/PDFs into Supabase, then switch off Emergent | Last |

## What's in step 1

Migration: `supabase/migrations/20261109100000_tool_tracker_core.sql`. Every object is prefixed `tt_` so nothing
touches Site-Day's own tables or grants.

- `tt_companies`, `tt_members` (admin / site_manager / worker), `tt_subscriptions` (server-written billing state)
- `tt_tools`, `tt_categories`, `tt_borrowers` (personal plan: a name and phone, no login), `tt_checkouts`,
  `tt_maintenance`, `tt_certificates`, `tt_notifications`, `tt_audit_log`, `tt_billing_events` (server only)
- Storage bucket `tool-tracker` (private, 10 MB, images + PDF). Paths: `<company_id>/tools/<tool_id>/...`.
  The app shows files with short-lived signed URLs, so nothing is public.
- RPCs: `tt_create_company(name, your_name, brand)` (sign-up, starts a 14-day personal trial) and
  `tt_hand_over(checkout, holder_user | borrower, ...)`.

Rules enforced in the database (not just the screens):
- Companies can't see or touch each other's tools, people, files or history.
- Only admins change roles or deactivate people; nobody changes their own role; a company always keeps an admin.
- Deactivated members lose access straight away.
- One active check-out per tool; holder names come from the member/borrower record; check-outs can only be closed,
  not rewritten; handovers only through `tt_hand_over`.
- Trial ended / subscription cancelled: everyone can still **read and export**, but can't add or change anything.
  (Personal users keep their records when they upgrade – same company, plan changes.)
- Billing state can only be written by the server.

Tests: `supabase/tests/tool_tracker_rls_test.sql` (40 checks). Run against a scratch Postgres:

```
psql -d scratch -f supabase/tests/supabase_stub.sql
psql -d scratch -f supabase/migrations/20261109100000_tool_tracker_core.sql
psql -d scratch -f supabase/tests/tool_tracker_rls_test.sql
```

Also smoke-tested on the live project inside a transaction that was rolled back (nothing left behind).

## Step 4 – Stripe plan

Stripe account: **Long Line Site-Day** (`acct_1RfsPPLb1OAiQ1Mf`, live). It only has the "Site-Day Solo" product so far.

- Build and test in a **Stripe sandbox** first (needs test keys from the Stripe dashboard) – never on live.
- Products (metadata `app=tool-tracker`): Personal (monthly + yearly) and Crew (per company, seat limit).
  Prices to decide – see below.
- Checkout Session (subscription mode) created by an edge function, with `client_reference_id = company_id`.
- Customer Portal for card changes / cancelling.
- Webhook edge function: verifies the signature, records the event in `tt_billing_events` (idempotent), updates
  `tt_subscriptions` (plan, status, seat_limit, period end). Same shape as Site-Day's `site_day_entitlements`.
- Prices in NZD, GST-inclusive display.

## Decisions (9 Nov 2026 – Davy went with Claude's recommendations; starting points, easy to change in Stripe)

- Hosting: tool tracker website moves to Davy's **own** Cloudflare account (Pages), free `.pages.dev` address
  for now; buy a domain when ready to sell. Move only after the screens are on Supabase (step 3).
  Deploys are manual only – no auto-publish on push, preview deploys off.
- Orders unLimited and Safety unLimited stay on Vercel for now.
- Personal plan: **free up to 25 tools**; Personal Plus **NZ$4.99/month or NZ$49/year** for unlimited tools.
- Crew plan: **NZ$49/month per company including 5 users**, **NZ$8/month per extra user**
  (cheaper than ShareMyToolbox's ~US$100/month for 5 users). Site-Day add-on discount to decide later.
- Trial: 14 days (same as Site-Day).
- Still to do from the laptop: Stripe sandbox test keys; turn on leaked-password protection in Supabase Auth.

## One brand domain (ready, just add the domain)

All app addresses live in `frontend/src/lib/siteConfig.js`. When the domain is bought:
1. Cloudflare: add custom domain `tools.<domain>` to the tool tracker Pages project.
2. Hosting env var: `REACT_APP_BRAND_DOMAIN=<domain>` – the app then links to `siteday.`, `timesheets.`, `fitout.` and the
   launcher on the bare domain automatically.
3. Supabase Auth → URL Configuration: add `https://tools.<domain>/**` to Redirect URLs (sign-up confirm, invites, resets).
4. Edge function secret `TT_ALLOWED_ORIGINS=https://tools.<domain>` (locks the team function to the real site).
5. Stripe success/cancel URLs and Customer Portal return URL use the same address (step 4 work).

## Testing the preview (10 Nov)

- Preview of branch `supabase/move-part-1`:
  https://tool-tracker-enterprise-git-supabase-c7ad9f-dcljlongs-projects.vercel.app (Supabase settings are set for this
  branch's previews only; production still runs the old server).
- Throwaway test login made in Supabase: `tt-test-owner@longline.invalid` (password given to Davy in chat). Delete
  it after testing.
- Supabase Auth needs, from the dashboard: Redirect URL `https://*-dcljlongs-projects.vercel.app/**` for previews;
  leaked-password protection on; custom SMTP before launch (the built-in sender is rate-limited and for testing only).

## Step 4 – Stripe (10 Nov 2026)

- Fixed from Davy's preview test: check-outs, history, reports and handover all failed (ambiguous tools↔check-outs link,
  PostgREST error PGRST201). Now named explicitly. `tests/supabase/check_app_queries.py` runs every app query plus
  check-out → handover → return against a local PostgREST.
- Migration `20261110090000_tool_tracker_billing.sql` (applied to live 10 Nov): free personal tier (25 active tools,
  never locked, records kept), Personal Plus/crew unlimited, extra seats, Stripe ids unique per company.
  53 database checks pass.
- Edge functions (written, tested, **not yet deployed**):
  - `tt-billing` (verify_jwt on): admin-only Checkout and Customer Portal. Prices found by lookup key.
  - `tt-stripe-webhook` (verify_jwt **off**, checks the Stripe signature): re-reads each subscription from Stripe,
    ignores Site-Day subscriptions, blocks cross-company upgrades, Personal Plus → Crew cancels the old sub with credit.
  - 13 unit tests: `deno test supabase/functions/_shared/tt_billing_test.ts`.
- App: Settings → Plan & billing card; banner shows Free / trial / active / ended.

Stripe lookup keys (create in the sandbox, NZD, monthly/yearly recurring):
`tt_personal_plus_month` 4.99, `tt_personal_plus_year` 49, `tt_crew_month` 49, `tt_crew_extra_seat_month` 8.

Secrets (Supabase > Edge Functions > Secrets): `TT_STRIPE_SECRET_KEY`, `TT_STRIPE_WEBHOOK_SECRET`, `TT_ALLOWED_ORIGINS`.
Webhook events: checkout.session.completed, customer.subscription.created/updated/deleted, invoice.paid, invoice.payment_failed.
Customer Portal: allow card update, cancel, invoice history; for crew allow quantity changes on the extra-seat price.

### Stripe test mode setup (done 10 Nov 2026)
- Account Long Line Site-Day, **test mode**. Products: Personal Plus (`prod_Vb8dqwYY7LR6jH`), Crew (`prod_Vb8dPmdLvk0FNv`),
  Crew extra user (`prod_Vb8dSHH1bMxhnv`); four NZD prices with the `tt_` lookup keys (tax behaviour: inclusive).
- Customer Portal config `bpc_1UZwMbLb1OAiQ1MfL7NsFJUS` (test-mode default; card, invoices, name/email/address, cancel at period end).
  For live, create a separate config and set `TT_STRIPE_PORTAL_CONFIG` so Site-Day's default isn't used.
- Webhook endpoint `we_1UZwNwLb1OAiQ1MfNTxHMICH` → `tt-stripe-webhook`.
- Supabase secrets set by Davy: `TT_STRIPE_SECRET_KEY` (test), `TT_STRIPE_WEBHOOK_SECRET`.
- Edge functions deployed: `tt-billing` (v1, verify_jwt on), `tt-stripe-webhook` (v1, verify_jwt off).
- End-to-end test (API-driven, test card): subscribe → company on Personal Plus active with period end; cancel at period end →
  flag set; cancel now → back to free tier. 4 webhook events, all processed, no errors. Test customer `cus_Vb8lxNq0plc5Zt`.
- Davy's hand test in the preview (10 Nov, 06:40): Plan & billing → Stripe Checkout (test card) → Personal Plus active;
  Manage billing shows plan, card, invoices; Cancel subscription → cancel_at_period_end recorded. 7 webhook events, 0 errors.
- Before live: decide the Stripe business name shown on checkout/portal (currently "Long Line Site-Day"), live prices,
  live portal config (`TT_STRIPE_PORTAL_CONFIG`), live webhook + keys, leaked-password protection, own email sender.

### To do next (from Davy's preview test, 10 Nov)
- Check-out works in the preview. Handover list was empty because the test account has one user - now says so.
- **Borrowers screen missing:** personal plan needs "lend to a named person" (name + phone, no login). Database already has
  `tt_borrowers` and `tt_hand_over(p_borrower)`; the screens don't use them yet. Build in part 5.
- Later feature (after go-live): company branding on the Crew plan (logo, name, colour on screens, PDFs, QR labels, emails).
- Stripe account public name and statement descriptor changed to **Long Line** (10 Nov). Domain not bought yet (pick: longlineworks.com).
