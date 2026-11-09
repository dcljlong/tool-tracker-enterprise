-- Tool tracker billing (Stripe) and the free personal tier.
--
-- Plans (decided 9 Nov 2026, prices live in Stripe):
--   personal (free)   : up to 25 tools, 1 login, never locked - the free tier is what a personal account
--                       drops to when its trial ends or Personal Plus is cancelled.
--   personal (plus)   : paid (or in trial) - unlimited tools, 1 login.
--   crew              : paid per company, 5 logins included + extra seats. Lapsed crew = read and export only.
--
-- Billing state is only ever written by the server (Stripe webhook, service role).

alter table public.tt_subscriptions
  add column if not exists price_lookup_key text,
  add column if not exists extra_seats integer not null default 0 check (extra_seats >= 0);

create unique index if not exists tt_subscriptions_provider_customer
  on public.tt_subscriptions (provider_customer_id) where provider_customer_id is not null;
create unique index if not exists tt_subscriptions_provider_subscription
  on public.tt_subscriptions (provider_subscription_id) where provider_subscription_id is not null;

alter table public.tt_billing_events
  add column if not exists company_id uuid references public.tt_companies (id) on delete set null,
  add column if not exists error text;

-- Paid up, in trial, or in the payment grace period.
create or replace function tt_private.plan_paid(p_company uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tt_subscriptions s
    where s.company_id = p_company
      and (s.status in ('active', 'past_due', 'complimentary', 'beta')
           or (s.status = 'trial' and s.trial_ends_at > now()))
  )
$$;

-- Who can add or change things. Personal accounts are never locked: unpaid they are on the free tier
-- (limited by tt_private.enforce_free_tool_limit). Lapsed crew companies can still read and export.
create or replace function tt_private.subscription_ok(p_company uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select tt_private.plan_paid(p_company)
      or exists (select 1 from public.tt_subscriptions s where s.company_id = p_company and s.plan = 'personal')
$$;

create or replace function tt_private.free_tool_limit()
returns integer language sql immutable set search_path = '' as $$ select 25 $$;

create or replace function tt_private.enforce_free_tool_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  if tg_op = 'UPDATE' and not (old.archived_at is not null and new.archived_at is null) then
    return new;
  end if;
  if new.archived_at is not null then return new; end if;
  if not exists (select 1 from public.tt_subscriptions s where s.company_id = new.company_id and s.plan = 'personal')
     or tt_private.plan_paid(new.company_id) then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('tt_tools:' || new.company_id::text));
  select count(*) into v_count from public.tt_tools t
    where t.company_id = new.company_id and t.archived_at is null and t.id <> new.id;
  if v_count >= tt_private.free_tool_limit() then
    raise exception 'The free plan holds up to % tools. Upgrade to Personal Plus for unlimited tools.',
      tt_private.free_tool_limit() using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists tt_tools_free_limit_insert on public.tt_tools;
create trigger tt_tools_free_limit_insert before insert on public.tt_tools
  for each row execute function tt_private.enforce_free_tool_limit();
drop trigger if exists tt_tools_free_limit_restore on public.tt_tools;
create trigger tt_tools_free_limit_restore before update of archived_at on public.tt_tools
  for each row execute function tt_private.enforce_free_tool_limit();

revoke all on function tt_private.plan_paid(uuid) from public, anon;
grant execute on function tt_private.plan_paid(uuid) to authenticated, service_role;
revoke all on function tt_private.enforce_free_tool_limit() from public, anon, authenticated;
