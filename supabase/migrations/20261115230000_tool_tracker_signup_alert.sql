-- Email the owner when a new Tool Tracker company signs up: after a tt_companies insert, the database calls the
-- tt-alerts Edge Function (no login needed; the function checks the company is new and only emails once).
create extension if not exists pg_net with schema extensions;

create or replace function tt_private.signup_alert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := 'https://pmwjaabhbewlxuewcrbr.supabase.co/functions/v1/tt-alerts',
    body := jsonb_build_object('company_id', new.id),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
exception when others then
  return new; -- an alert problem must never stop a sign-up
end $$;
revoke all on function tt_private.signup_alert() from public;

drop trigger if exists tt_companies_signup_alert on public.tt_companies;
create trigger tt_companies_signup_alert
  after insert on public.tt_companies
  for each row execute function tt_private.signup_alert();
