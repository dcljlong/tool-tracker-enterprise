-- Tool tracker on Supabase (lives in the Site-Day project; every object is prefixed tt_)
-- One codebase, two plans: personal (one owner, borrowers are just names) and crew/enterprise (team logins).
-- Company separation is enforced in the database with RLS, so the browser talks to Supabase directly.

-- ---------------------------------------------------------------------------
-- Private helper schema (not exposed through the Data API)
-- ---------------------------------------------------------------------------
create schema if not exists tt_private;
revoke all on schema tt_private from public;
grant usage on schema tt_private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Companies, members, subscriptions
-- ---------------------------------------------------------------------------
create table public.tt_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  brand text not null default 'long_line' check (brand in ('long_line', 'site_day')),
  notify_tag_expiry boolean not null default true,
  notify_overdue boolean not null default true,
  notify_handover boolean not null default true,
  notify_days_before smallint not null default 14 check (notify_days_before between 1 and 90),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tt_companies_created_by_idx on public.tt_companies (created_by);

create table public.tt_members (
  company_id uuid not null references public.tt_companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  role text not null default 'worker' check (role in ('admin', 'site_manager', 'worker')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, user_id)
);
create index tt_members_user_idx on public.tt_members (user_id);

-- Billing state. Written only by the server (Stripe webhook / service role); members can read it.
create table public.tt_subscriptions (
  company_id uuid primary key references public.tt_companies (id) on delete cascade,
  plan text not null default 'personal' check (plan in ('personal', 'crew', 'enterprise')),
  status text not null default 'trial'
    check (status in ('trial', 'active', 'past_due', 'canceled', 'complimentary', 'beta')),
  trial_ends_at timestamptz not null default (now() + interval '14 days'),
  seat_limit integer not null default 1 check (seat_limit >= 1),
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);
comment on table public.tt_subscriptions is 'Server-written billing state. Browser can read own company only.';

create table public.tt_billing_events (
  event_id text primary key,
  event_type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  payload jsonb not null default '{}'::jsonb
);
comment on table public.tt_billing_events is 'Server-only Stripe webhook idempotency/audit records. No browser access.';

-- ---------------------------------------------------------------------------
-- Access helpers (security definer so RLS policies don't recurse into tt_members)
-- ---------------------------------------------------------------------------
create or replace function tt_private.member_role(p_company uuid)
returns text language sql stable security definer set search_path = '' as $$
  select m.role from public.tt_members m
  where m.company_id = p_company and m.user_id = (select auth.uid()) and m.is_active
$$;

create or replace function tt_private.is_member(p_company uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select tt_private.member_role(p_company) is not null
$$;

create or replace function tt_private.has_role(p_company uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(tt_private.member_role(p_company) = any (p_roles), false)
$$;

-- Paid up (or in trial / grace). Lapsed companies can still read and export, but not add or change.
create or replace function tt_private.subscription_ok(p_company uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tt_subscriptions s
    where s.company_id = p_company
      and (s.status in ('active', 'past_due', 'complimentary', 'beta')
           or (s.status = 'trial' and s.trial_ends_at > now()))
  )
$$;

create or replace function tt_private.can_write(p_company uuid, p_roles text[] default array['admin', 'site_manager', 'worker'])
returns boolean language sql stable security definer set search_path = '' as $$
  select tt_private.has_role(p_company, p_roles) and tt_private.subscription_ok(p_company)
$$;

-- Company id from a storage path like '<company_id>/tools/<tool_id>/photo.jpg' (null if not a uuid)
create or replace function tt_private.path_company(p_name text)
returns uuid language sql immutable set search_path = '' as $$
  select case when split_part(p_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_name, '/', 1)::uuid end
$$;

revoke all on all functions in schema tt_private from public;
grant execute on all functions in schema tt_private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tool data
-- ---------------------------------------------------------------------------
create table public.tt_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.tt_companies (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text not null default '',
  created_at timestamptz not null default now()
);
create unique index tt_categories_company_name_key on public.tt_categories (company_id, lower(name));

-- Personal plan borrowers: just a name and phone, no login needed.
create table public.tt_borrowers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.tt_companies (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  phone text check (phone is null or char_length(phone) <= 40),
  email text check (email is null or char_length(email) <= 200),
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique (company_id, id)
);

create table public.tt_tools (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.tt_companies (id) on delete cascade,
  asset_id text not null check (char_length(btrim(asset_id)) between 1 and 60),
  description text not null check (char_length(btrim(description)) between 1 and 300),
  category text not null default '',
  model_name text not null default '',
  serial_number text not null default '',
  condition text not null default 'good' check (char_length(condition) between 1 and 40),
  status text not null default 'available'
    check (status in ('available', 'checked_out', 'maintenance_required', 'out_of_service', 'lost', 'retired')),
  safety_tag_expiry date,
  next_maintenance_date date,
  purchase_date date,
  purchase_price numeric(12, 2) check (purchase_price is null or purchase_price >= 0),
  notes text not null default '',
  photo_path text,
  current_checkout_id uuid,
  archived_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id)
);
create unique index tt_tools_company_asset_key on public.tt_tools (company_id, lower(asset_id)) where archived_at is null;
create index tt_tools_company_status_idx on public.tt_tools (company_id, status);
create index tt_tools_created_by_idx on public.tt_tools (created_by);

create table public.tt_checkouts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  tool_id uuid not null,
  holder_user_id uuid references auth.users (id) on delete set null,
  borrower_id uuid,
  holder_name text not null check (char_length(btrim(holder_name)) between 1 and 120),
  checked_out_by uuid references auth.users (id) on delete set null,
  job_number text not null default '',
  site text not null default '',
  site_manager text not null default '',
  expected_return_date date,
  notes text not null default '',
  handed_over_from uuid references public.tt_checkouts (id) on delete set null,
  checked_out_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'returned', 'handed_over')),
  returned_at timestamptz,
  returned_by uuid references auth.users (id) on delete set null,
  return_condition text,
  return_notes text,
  foreign key (company_id, tool_id) references public.tt_tools (company_id, id) on delete cascade,
  foreign key (company_id, borrower_id) references public.tt_borrowers (company_id, id) on delete restrict,
  check (holder_user_id is not null or borrower_id is not null)
);
create unique index tt_checkouts_one_active_per_tool on public.tt_checkouts (tool_id) where status = 'active';
create index tt_checkouts_company_status_idx on public.tt_checkouts (company_id, status);
create index tt_checkouts_tool_idx on public.tt_checkouts (company_id, tool_id);
create index tt_checkouts_holder_idx on public.tt_checkouts (holder_user_id);
create index tt_checkouts_borrower_idx on public.tt_checkouts (company_id, borrower_id);
create index tt_checkouts_checked_out_by_idx on public.tt_checkouts (checked_out_by);
create index tt_checkouts_returned_by_idx on public.tt_checkouts (returned_by);
create index tt_checkouts_handed_over_from_idx on public.tt_checkouts (handed_over_from);

alter table public.tt_tools
  add constraint tt_tools_current_checkout_fkey foreign key (current_checkout_id)
  references public.tt_checkouts (id) on delete set null;
create index tt_tools_current_checkout_idx on public.tt_tools (current_checkout_id);

create table public.tt_maintenance (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  tool_id uuid not null,
  action_type text not null check (char_length(btrim(action_type)) between 1 and 60),
  description text not null default '',
  performed_by uuid references auth.users (id) on delete set null,
  performed_by_name text not null default '',
  performed_at timestamptz not null default now(),
  foreign key (company_id, tool_id) references public.tt_tools (company_id, id) on delete cascade
);
create index tt_maintenance_tool_idx on public.tt_maintenance (company_id, tool_id);
create index tt_maintenance_performed_by_idx on public.tt_maintenance (performed_by);

create table public.tt_certificates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  tool_id uuid not null,
  certificate_type text not null check (char_length(btrim(certificate_type)) between 1 and 80),
  certificate_number text not null default '',
  issuer_name text not null default '',
  issuer_company text not null default '',
  issuer_license_number text not null default '',
  nz_standard text not null default '',
  issue_date date,
  expiry_date date,
  notes text not null default '',
  document_path text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (company_id, tool_id) references public.tt_tools (company_id, id) on delete cascade
);
create index tt_certificates_tool_idx on public.tt_certificates (company_id, tool_id);
create index tt_certificates_expiry_idx on public.tt_certificates (company_id, expiry_date);
create index tt_certificates_created_by_idx on public.tt_certificates (created_by);

create table public.tt_notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.tt_companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  message text not null,
  tool_id uuid references public.tt_tools (id) on delete cascade,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index tt_notifications_user_idx on public.tt_notifications (user_id, read, created_at desc);
create index tt_notifications_company_idx on public.tt_notifications (company_id);
create index tt_notifications_tool_idx on public.tt_notifications (tool_id);

create table public.tt_audit_log (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.tt_companies (id) on delete cascade,
  tool_id uuid,
  action text not null,
  user_id uuid,
  details jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index tt_audit_company_at_idx on public.tt_audit_log (company_id, at desc);
create index tt_audit_tool_idx on public.tt_audit_log (company_id, tool_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function tt_private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

create trigger tt_companies_touch before update on public.tt_companies
  for each row execute function tt_private.touch_updated_at();
create trigger tt_members_touch before update on public.tt_members
  for each row execute function tt_private.touch_updated_at();
create trigger tt_tools_touch before update on public.tt_tools
  for each row execute function tt_private.touch_updated_at();

-- Members: ids fixed; only admins change role/active; you can't change your own; always keep one admin.
create or replace function tt_private.guard_member_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.company_id <> old.company_id or new.user_id <> old.user_id then
    raise exception 'Member ids cannot change';
  end if;
  if (select auth.uid()) is not null and (new.role <> old.role or new.is_active <> old.is_active) then
    if not tt_private.has_role(old.company_id, array['admin']) then
      raise exception 'Only an admin can change roles or deactivate people';
    end if;
    if old.user_id = (select auth.uid()) then
      raise exception 'You can''t change your own role or deactivate yourself';
    end if;
  end if;
  return new;
end $$;
create trigger tt_members_guard before update on public.tt_members
  for each row execute function tt_private.guard_member_update();

create or replace function tt_private.keep_one_admin()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_company uuid := coalesce(old.company_id, new.company_id);
begin
  if exists (select 1 from public.tt_companies c where c.id = v_company)
     and not exists (select 1 from public.tt_members m
                     where m.company_id = v_company and m.role = 'admin' and m.is_active) then
    raise exception 'A company must keep at least one active admin';
  end if;
  return null;
end $$;
create constraint trigger tt_members_keep_admin after update or delete on public.tt_members
  deferrable initially deferred for each row execute function tt_private.keep_one_admin();

-- Check-outs: fill in names, keep the tool's status in step, block edits other than returning.
create or replace function tt_private.checkout_before()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  if tg_op = 'INSERT' then
    select t.status into v_status from public.tt_tools t
      where t.id = new.tool_id and t.company_id = new.company_id and t.archived_at is null for update;
    if v_status is null then raise exception 'Tool not found'; end if;
    if new.handed_over_from is not null then
      -- Only tt_hand_over() opens a handover row, straight after closing the previous holder's one.
      if coalesce(current_setting('tt.handover', true), '') <> new.handed_over_from::text
         or not exists (select 1 from public.tt_checkouts o
                        where o.id = new.handed_over_from and o.tool_id = new.tool_id and o.status = 'handed_over') then
        raise exception 'Use hand over to pass a tool to the next person';
      end if;
    elsif v_status <> 'available' then
      raise exception 'Tool is not available (status: %)', v_status;
    end if;
    if new.holder_user_id is not null then
      select m.name into new.holder_name from public.tt_members m
        where m.company_id = new.company_id and m.user_id = new.holder_user_id and m.is_active;
      if new.holder_name is null then raise exception 'Holder is not an active member of this company'; end if;
    else
      select b.name into new.holder_name from public.tt_borrowers b
        where b.company_id = new.company_id and b.id = new.borrower_id;
      if new.holder_name is null then raise exception 'Borrower not found'; end if;
    end if;
    new.checked_out_by := coalesce((select auth.uid()), new.checked_out_by);
    new.checked_out_at := now();
    new.status := 'active';
    new.returned_at := null; new.returned_by := null; new.return_condition := null; new.return_notes := null;
    return new;
  end if;

  -- UPDATE: only an active check-out can be closed, and only the return fields may change.
  if old.status <> 'active' then raise exception 'This check-out is already closed'; end if;
  if (new.company_id, new.tool_id, new.holder_user_id, new.borrower_id, new.holder_name, new.checked_out_by,
      new.job_number, new.site, new.site_manager, new.expected_return_date, new.notes, new.handed_over_from,
      new.checked_out_at)
     is distinct from
     (old.company_id, old.tool_id, old.holder_user_id, old.borrower_id, old.holder_name, old.checked_out_by,
      old.job_number, old.site, old.site_manager, old.expected_return_date, old.notes, old.handed_over_from,
      old.checked_out_at) then
    raise exception 'Only the return details of a check-out can be changed';
  end if;
  if new.status = 'handed_over' and coalesce(current_setting('tt.handover', true), '') <> 'closing:' || old.id::text then
    raise exception 'Use hand over to pass a tool to the next person';
  end if;
  if new.status not in ('returned', 'handed_over') then raise exception 'Invalid check-out status'; end if;
  new.returned_at := now();
  new.returned_by := coalesce((select auth.uid()), new.returned_by);
  return new;
end $$;
create trigger tt_checkouts_before before insert or update on public.tt_checkouts
  for each row execute function tt_private.checkout_before();

create or replace function tt_private.checkout_after()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.tt_tools set status = 'checked_out', current_checkout_id = new.id where id = new.tool_id;
    insert into public.tt_audit_log (company_id, tool_id, action, user_id, details)
      values (new.company_id, new.tool_id, case when new.handed_over_from is null then 'checked_out' else 'handed_over' end,
              (select auth.uid()), jsonb_build_object('holder', new.holder_name, 'job', new.job_number, 'site', new.site));
  elsif new.status = 'returned' then
    update public.tt_tools set status = case when new.return_condition in ('damaged', 'needs_repair', 'poor')
                                             then 'maintenance_required' else 'available' end,
                               condition = coalesce(nullif(new.return_condition, ''), condition),
                               current_checkout_id = null
      where id = new.tool_id and current_checkout_id = new.id;
    insert into public.tt_audit_log (company_id, tool_id, action, user_id, details)
      values (new.company_id, new.tool_id, 'returned', (select auth.uid()),
              jsonb_build_object('holder', new.holder_name, 'condition', new.return_condition));
  end if;
  return null;
end $$;
create trigger tt_checkouts_after after insert or update on public.tt_checkouts
  for each row execute function tt_private.checkout_after();

-- Audit tool edits (who changed what)
create or replace function tt_private.audit_tool()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.tt_audit_log (company_id, tool_id, action, user_id, details)
      values (new.company_id, new.id, 'tool_created', (select auth.uid()), jsonb_build_object('asset_id', new.asset_id));
  elsif (select auth.uid()) is not null then  -- skip status flips made by the check-out triggers
    if new.archived_at is not null and old.archived_at is null then
      insert into public.tt_audit_log (company_id, tool_id, action, user_id, details)
        values (new.company_id, new.id, 'tool_archived', (select auth.uid()), jsonb_build_object('asset_id', new.asset_id));
    elsif to_jsonb(new) - array['updated_at', 'status', 'current_checkout_id', 'condition']
          is distinct from to_jsonb(old) - array['updated_at', 'status', 'current_checkout_id', 'condition']
          or new.status <> old.status and old.current_checkout_id is not distinct from new.current_checkout_id then
      insert into public.tt_audit_log (company_id, tool_id, action, user_id, details)
        values (new.company_id, new.id, 'tool_updated', (select auth.uid()), jsonb_build_object('asset_id', new.asset_id));
    end if;
  end if;
  return null;
end $$;
create trigger tt_tools_audit after insert or update on public.tt_tools
  for each row execute function tt_private.audit_tool();

-- Tools: company id fixed; check-out fields only move through check-outs.
create or replace function tt_private.guard_tool_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.company_id <> old.company_id then raise exception 'Tool company cannot change'; end if;
  if pg_trigger_depth() = 1 and new.current_checkout_id is distinct from old.current_checkout_id then
    raise exception 'Use check-out / return to change who has a tool';
  end if;
  if pg_trigger_depth() = 1 and (new.status = 'checked_out') <> (old.status = 'checked_out') then
    raise exception 'Use check-out / return to change a tool to or from checked out';
  end if;
  return new;
end $$;
create trigger tt_tools_guard before update on public.tt_tools
  for each row execute function tt_private.guard_tool_update();

create or replace function tt_private.guard_tool_insert()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.status := case when new.status = 'checked_out' then 'available' else new.status end;
  new.current_checkout_id := null;
  new.created_by := coalesce((select auth.uid()), new.created_by);
  return new;
end $$;
create trigger tt_tools_guard_insert before insert on public.tt_tools
  for each row execute function tt_private.guard_tool_insert();

-- ---------------------------------------------------------------------------
-- RPCs the app calls (security invoker wrappers; the definer work lives in tt_private)
-- ---------------------------------------------------------------------------
create or replace function tt_private.create_company(p_name text, p_member_name text, p_brand text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_company uuid;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if (select count(*) from public.tt_companies c where c.created_by = v_uid) >= 3 then
    raise exception 'Limit of 3 workspaces per account';
  end if;
  insert into public.tt_companies (name, brand, created_by)
    values (p_name, coalesce(nullif(p_brand, ''), 'long_line'), v_uid) returning id into v_company;
  insert into public.tt_members (company_id, user_id, name, role) values (v_company, v_uid, p_member_name, 'admin');
  insert into public.tt_subscriptions (company_id, plan, status, seat_limit) values (v_company, 'personal', 'trial', 1);
  return v_company;
end $$;
revoke all on function tt_private.create_company(text, text, text) from public;
grant execute on function tt_private.create_company(text, text, text) to authenticated;

create or replace function public.tt_create_company(p_name text, p_member_name text, p_brand text default 'long_line')
returns uuid language sql security invoker set search_path = '' as $$
  select tt_private.create_company(p_name, p_member_name, p_brand)
$$;
revoke all on function public.tt_create_company(text, text, text) from public, anon;
grant execute on function public.tt_create_company(text, text, text) to authenticated;

-- Handover: close the current check-out and open a new one for the next holder in one transaction.
create or replace function public.tt_hand_over(p_checkout uuid, p_holder_user uuid default null, p_borrower uuid default null,
                                               p_job text default null, p_site_manager text default null, p_notes text default '')
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_old public.tt_checkouts; v_new uuid;
begin
  select * into v_old from public.tt_checkouts where id = p_checkout and status = 'active' for update;
  if v_old.id is null then raise exception 'Check-out not found or already closed'; end if;
  perform set_config('tt.handover', 'closing:' || p_checkout::text, true);
  update public.tt_checkouts set status = 'handed_over', return_notes = 'Handed over' where id = p_checkout;
  perform set_config('tt.handover', p_checkout::text, true);
  insert into public.tt_checkouts (company_id, tool_id, holder_user_id, borrower_id, holder_name, job_number, site,
                                   site_manager, expected_return_date, notes, handed_over_from)
    values (v_old.company_id, v_old.tool_id, p_holder_user, p_borrower, 'pending', coalesce(p_job, v_old.job_number),
            v_old.site, coalesce(p_site_manager, v_old.site_manager), v_old.expected_return_date, coalesce(p_notes, ''),
            p_checkout)
    returning id into v_new;
  perform set_config('tt.handover', '', true);
  return v_new;
end $$;
revoke all on function public.tt_hand_over(uuid, uuid, uuid, text, text, text) from public, anon;
grant execute on function public.tt_hand_over(uuid, uuid, uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.tt_companies enable row level security;
alter table public.tt_members enable row level security;
alter table public.tt_subscriptions enable row level security;
alter table public.tt_billing_events enable row level security;
alter table public.tt_categories enable row level security;
alter table public.tt_borrowers enable row level security;
alter table public.tt_tools enable row level security;
alter table public.tt_checkouts enable row level security;
alter table public.tt_maintenance enable row level security;
alter table public.tt_certificates enable row level security;
alter table public.tt_notifications enable row level security;
alter table public.tt_audit_log enable row level security;

-- companies
create policy tt_companies_select on public.tt_companies for select to authenticated
  using (tt_private.is_member(id));
create policy tt_companies_update on public.tt_companies for update to authenticated
  using (tt_private.can_write(id, array['admin'])) with check (tt_private.can_write(id, array['admin']));

-- members (new members are added by the invite edge function with the service role)
create policy tt_members_select on public.tt_members for select to authenticated
  using (tt_private.is_member(company_id));
create policy tt_members_update_admin on public.tt_members for update to authenticated
  using (tt_private.can_write(company_id, array['admin'])) with check (tt_private.can_write(company_id, array['admin']));
create policy tt_members_update_self on public.tt_members for update to authenticated
  using (user_id = (select auth.uid()) and is_active) with check (user_id = (select auth.uid()));
create policy tt_members_delete_admin on public.tt_members for delete to authenticated
  using (tt_private.can_write(company_id, array['admin']) and user_id <> (select auth.uid()));

-- subscriptions: read only
create policy tt_subscriptions_select on public.tt_subscriptions for select to authenticated
  using (tt_private.is_member(company_id));
-- billing events: no policies (server only)

-- categories
create policy tt_categories_select on public.tt_categories for select to authenticated
  using (tt_private.is_member(company_id));
create policy tt_categories_insert on public.tt_categories for insert to authenticated
  with check (tt_private.can_write(company_id, array['admin', 'site_manager']));
create policy tt_categories_update on public.tt_categories for update to authenticated
  using (tt_private.can_write(company_id, array['admin', 'site_manager']))
  with check (tt_private.can_write(company_id, array['admin', 'site_manager']));
create policy tt_categories_delete on public.tt_categories for delete to authenticated
  using (tt_private.can_write(company_id, array['admin', 'site_manager']));

-- borrowers
create policy tt_borrowers_select on public.tt_borrowers for select to authenticated
  using (tt_private.is_member(company_id));
create policy tt_borrowers_insert on public.tt_borrowers for insert to authenticated
  with check (tt_private.can_write(company_id));
create policy tt_borrowers_update on public.tt_borrowers for update to authenticated
  using (tt_private.can_write(company_id)) with check (tt_private.can_write(company_id));
create policy tt_borrowers_delete on public.tt_borrowers for delete to authenticated
  using (tt_private.can_write(company_id, array['admin', 'site_manager']));

-- tools
create policy tt_tools_select on public.tt_tools for select to authenticated
  using (tt_private.is_member(company_id));
create policy tt_tools_insert on public.tt_tools for insert to authenticated
  with check (tt_private.can_write(company_id, array['admin', 'site_manager']));
create policy tt_tools_update on public.tt_tools for update to authenticated
  using (tt_private.can_write(company_id, array['admin', 'site_manager']))
  with check (tt_private.can_write(company_id, array['admin', 'site_manager']));
create policy tt_tools_delete on public.tt_tools for delete to authenticated
  using (tt_private.can_write(company_id, array['admin']));

-- check-outs: any active member of a paid-up company can check out and return
create policy tt_checkouts_select on public.tt_checkouts for select to authenticated
  using (tt_private.is_member(company_id));
create policy tt_checkouts_insert on public.tt_checkouts for insert to authenticated
  with check (tt_private.can_write(company_id));
create policy tt_checkouts_update on public.tt_checkouts for update to authenticated
  using (tt_private.can_write(company_id)) with check (tt_private.can_write(company_id));

-- maintenance and certificates
create policy tt_maintenance_select on public.tt_maintenance for select to authenticated
  using (tt_private.is_member(company_id));
create policy tt_maintenance_insert on public.tt_maintenance for insert to authenticated
  with check (tt_private.can_write(company_id, array['admin', 'site_manager']));
create policy tt_certificates_select on public.tt_certificates for select to authenticated
  using (tt_private.is_member(company_id));
create policy tt_certificates_insert on public.tt_certificates for insert to authenticated
  with check (tt_private.can_write(company_id, array['admin', 'site_manager']));
create policy tt_certificates_update on public.tt_certificates for update to authenticated
  using (tt_private.can_write(company_id, array['admin', 'site_manager']))
  with check (tt_private.can_write(company_id, array['admin', 'site_manager']));
create policy tt_certificates_delete on public.tt_certificates for delete to authenticated
  using (tt_private.can_write(company_id, array['admin', 'site_manager']));

-- notifications: your own only
create policy tt_notifications_select on public.tt_notifications for select to authenticated
  using (user_id = (select auth.uid()) and tt_private.is_member(company_id));
create policy tt_notifications_update on public.tt_notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- audit log: admins and site managers can read; nobody edits
create policy tt_audit_select on public.tt_audit_log for select to authenticated
  using (tt_private.has_role(company_id, array['admin', 'site_manager']));

-- Table grants (explicit, in case new tables aren't auto-exposed)
grant select, update on public.tt_companies to authenticated;
grant select, update, delete on public.tt_members to authenticated;
grant select on public.tt_subscriptions to authenticated;
grant select, insert, update, delete on public.tt_categories, public.tt_borrowers, public.tt_tools to authenticated;
grant select, insert, update on public.tt_checkouts to authenticated;
grant select, insert on public.tt_maintenance to authenticated;
grant select, insert, update, delete on public.tt_certificates to authenticated;
grant select, update (read) on public.tt_notifications to authenticated;
grant select on public.tt_audit_log to authenticated;
revoke all on public.tt_billing_events from anon, authenticated;
-- Only touch tool tracker tables; Site-Day's own grants are left exactly as they are.
revoke all on public.tt_companies, public.tt_members, public.tt_subscriptions, public.tt_billing_events, public.tt_categories, public.tt_borrowers, public.tt_tools, public.tt_checkouts, public.tt_maintenance, public.tt_certificates, public.tt_notifications, public.tt_audit_log from anon;
-- members may only edit name (self) or role/is_active (admin, guarded by trigger)
revoke update on public.tt_members from authenticated;
grant update (name, role, is_active) on public.tt_members to authenticated;
grant all on public.tt_companies, public.tt_members, public.tt_subscriptions, public.tt_billing_events, public.tt_categories, public.tt_borrowers, public.tt_tools, public.tt_checkouts, public.tt_maintenance, public.tt_certificates, public.tt_notifications, public.tt_audit_log to service_role;
grant usage on sequence public.tt_audit_log_id_seq to service_role;

-- ---------------------------------------------------------------------------
-- Private file storage: photos and certificate PDFs, path '<company_id>/...'
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tool-tracker', 'tool-tracker', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

create policy tt_files_select on storage.objects for select to authenticated
  using (bucket_id = 'tool-tracker' and tt_private.is_member(tt_private.path_company(name)));
create policy tt_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'tool-tracker' and tt_private.can_write(tt_private.path_company(name)));
create policy tt_files_update on storage.objects for update to authenticated
  using (bucket_id = 'tool-tracker' and tt_private.can_write(tt_private.path_company(name), array['admin', 'site_manager']))
  with check (bucket_id = 'tool-tracker' and tt_private.can_write(tt_private.path_company(name), array['admin', 'site_manager']));
create policy tt_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'tool-tracker' and tt_private.can_write(tt_private.path_company(name), array['admin', 'site_manager']));
