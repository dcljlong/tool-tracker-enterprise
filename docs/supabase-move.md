# Tool tracker: move to Supabase

Goal: retire the Emergent FastAPI + MongoDB server. The tool tracker runs on the **Site-Day Supabase project**
(`pmwjaabhbewlxuewcrbr`, Sydney) so one login covers Site-Day and the tool tracker. The website stays on Vercel
(or Cloudflare Pages later). One codebase, two plans and two looks (`brand`: `long_line` personal, `site_day` crew).

## Status

| Step | What | Status |
|---|---|---|
| 1 | Database tables, company separation (RLS), private photo/PDF storage | **Done 9 Nov 2026** – applied to Site-Day project |
| 2 | Sign-up and login (Supabase Auth, shared with Site-Day) | Next |
| 3 | Switch the screens from the FastAPI server to Supabase (12 pages, ~50 API calls) | Next |
| 4 | Stripe: checkout, customer portal, webhook → `tt_subscriptions` | After 3 |
| 5 | Invite team members (edge function, service role, seat limit) | After 3 |
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

## Decisions for Davy

1. Prices: personal (free tier + cheap paid?) and crew (per company or per user?).
2. Trial length (currently 14 days, same as Site-Day).
3. Free personal tier limits (e.g. 25 tools, no team logins) or paid only.
4. Turn on leaked-password protection in Supabase Auth settings before public sign-up opens.
