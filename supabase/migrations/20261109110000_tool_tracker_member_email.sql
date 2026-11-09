-- Members carry their sign-in email so the team screen can show it (auth.users isn't readable from the browser).
alter table public.tt_members add column if not exists email text check (email is null or char_length(email) <= 320);

create or replace function tt_private.create_company(p_name text, p_member_name text, p_brand text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_company uuid;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if (select count(*) from public.tt_companies c where c.created_by = v_uid) >= 3 then
    raise exception 'Limit of 3 workspaces per account';
  end if;
  insert into public.tt_companies (name, brand, created_by)
    values (coalesce(nullif(btrim(p_name), ''), 'My tools'), coalesce(nullif(p_brand, ''), 'long_line'), v_uid)
    returning id into v_company;
  insert into public.tt_members (company_id, user_id, name, role, email)
    values (v_company, v_uid, coalesce(nullif(btrim(p_member_name), ''), 'Owner'), 'admin',
            (select u.email from auth.users u where u.id = v_uid));
  insert into public.tt_subscriptions (company_id, plan, status, seat_limit) values (v_company, 'personal', 'trial', 1);
  return v_company;
end $$;
revoke all on function tt_private.create_company(text, text, text) from public;
grant execute on function tt_private.create_company(text, text, text) to authenticated;

-- Server-only lookup used by the tt-team edge function to add someone who already has an account.
create or replace function public.tt_user_id_by_email(p_email text)
returns uuid language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u where lower(u.email) = lower(btrim(p_email)) limit 1
$$;
revoke all on function public.tt_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.tt_user_id_by_email(text) to service_role;
