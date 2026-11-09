-- RLS and business-rule checks for the tool tracker tables.
-- Run against a scratch database with the migration applied (see supabase/tests/README.md).
\set ON_ERROR_STOP on
\set QUIET on

create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p::text, ''), false);
  execute 'set role ' || case when p is null then 'anon' else 'authenticated' end;
end $$;
create temp table results (n serial, test text, pass boolean, detail text);
grant all on results, results_n_seq to public;
create or replace function pg_temp.ok(t text, p boolean, d text default '') returns void language sql as
$$ insert into results (test, pass, detail) values (t, p, d) $$;
-- try(sql) -> error message or null
create or replace function pg_temp.try(q text) returns text language plpgsql as $$
begin execute q; return null; exception when others then return sqlerrm; end $$;

reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'boss-a@x.co'),
  ('00000000-0000-0000-0000-0000000000a2', 'worker-a@x.co'),
  ('00000000-0000-0000-0000-00000000000b', 'boss-b@x.co'),
  ('00000000-0000-0000-0000-0000000000ff', 'nobody@x.co');

-- Company A (boss A) and company B (boss B) sign up
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
create temp table ids as select public.tt_create_company('Alpha Ltd', 'Boss A') as a;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into ids select null; update ids set a = a; -- noop
create temp table idsb as select public.tt_create_company('Bravo Ltd', 'Boss B', 'site_day') as b;
reset role;
grant select on ids, idsb to public;
-- worker added to A by the server (invite edge function)
insert into public.tt_members (company_id, user_id, name, role)
  select a, '00000000-0000-0000-0000-0000000000a2', 'Worker A', 'worker' from ids where a is not null;
update public.tt_subscriptions set plan = 'crew', seat_limit = 5 where company_id = (select a from ids where a is not null);

-- Boss A adds a tool and a borrower
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.tt_tools (company_id, asset_id, description, category)
  select a, 'DRILL-01', 'Makita drill', 'Power tools' from ids where a is not null;
insert into public.tt_borrowers (company_id, name, phone) select a, 'Uncle Bob', '021 000' from ids where a is not null;

-- 1. Company B can't see A's tools or borrowers
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.ok('B cannot see A tools', (select count(*) from public.tt_tools) = 0);
select pg_temp.ok('B cannot see A borrowers', (select count(*) from public.tt_borrowers) = 0);
select pg_temp.ok('B cannot see A members', (select count(*) from public.tt_members m where m.company_id <> (select b from idsb)) = 0);
-- 2. B can't write into A
select pg_temp.ok('B cannot add a tool to A',
  pg_temp.try(format('insert into public.tt_tools (company_id, asset_id, description) values (%L, ''X'', ''x'')', (select a from ids where a is not null))) is not null);
select pg_temp.ok('B cannot check out A tool',
  pg_temp.try(format('insert into public.tt_checkouts (company_id, tool_id, holder_user_id, holder_name) select company_id, id, %L, ''x'' from public.tt_tools', '00000000-0000-0000-0000-00000000000b')) is null
  and (select count(*) from public.tt_checkouts) = 0);
-- 3. Anonymous sees nothing
select pg_temp.as_user(null);
select pg_temp.ok('Anon cannot read tools', pg_temp.try('select * from public.tt_tools') is not null);
select pg_temp.ok('Anon cannot create company', pg_temp.try('select public.tt_create_company(''x'',''y'')') is not null);

-- 4. Worker A: can see and check out, can't promote self, can't edit tools, can't read billing events
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.ok('Worker sees company tools', (select count(*) from public.tt_tools) = 1);
select pg_temp.ok('Worker cannot make self admin',
  pg_temp.try($q$update public.tt_members set role = 'admin' where user_id = '00000000-0000-0000-0000-0000000000a2'$q$) is not null);
select pg_temp.ok('Worker role unchanged', (select role from public.tt_members where user_id = '00000000-0000-0000-0000-0000000000a2') = 'worker');
create temp table r1 as select pg_temp.try($q$update public.tt_members set name = 'Worker Aye' where user_id = '00000000-0000-0000-0000-0000000000a2'$q$) as err;
select pg_temp.ok('Worker can rename self',
  (select err from r1) is null and (select name from public.tt_members where user_id = '00000000-0000-0000-0000-0000000000a2') = 'Worker Aye',
  coalesce((select err from r1), ''));
select pg_temp.ok('Worker cannot move self to company B',
  pg_temp.try(format('update public.tt_members set company_id = %L where user_id = %L', (select b from idsb), '00000000-0000-0000-0000-0000000000a2')) is not null);
update public.tt_tools set description = 'hacked';
select pg_temp.ok('Worker cannot edit tool details', (select description from public.tt_tools) = 'Makita drill');
select pg_temp.ok('Worker cannot change subscription',
  pg_temp.try($q$update public.tt_subscriptions set status = 'active'$q$) is not null);
select pg_temp.ok('Worker cannot read billing events', pg_temp.try('select * from public.tt_billing_events') is not null);
select pg_temp.ok('Worker cannot read audit log', (select count(*) from public.tt_audit_log) = 0);
select pg_temp.ok('Worker can check out to self',
  pg_temp.try($q$insert into public.tt_checkouts (company_id, tool_id, holder_user_id, holder_name, job_number)
     select company_id, id, '00000000-0000-0000-0000-0000000000a2', 'spoofed', '4177' from public.tt_tools$q$) is null);
select pg_temp.ok('Holder name taken from member, not typed', (select holder_name from public.tt_checkouts) = 'Worker Aye');
select pg_temp.ok('Tool shows checked out', (select status from public.tt_tools) = 'checked_out');
select pg_temp.ok('Second check-out of same tool blocked',
  pg_temp.try($q$insert into public.tt_checkouts (company_id, tool_id, holder_user_id, holder_name)
     select company_id, id, '00000000-0000-0000-0000-0000000000a2', 'x' from public.tt_tools$q$) is not null);
select pg_temp.ok('Cannot rewrite job number on a check-out',
  pg_temp.try($q$update public.tt_checkouts set job_number = '9999'$q$) is not null);
select pg_temp.ok('Cannot fake a handover directly',
  pg_temp.try($q$update public.tt_checkouts set status = 'handed_over'$q$) is not null);

-- 5. Handover to a borrower, then return
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok('Handover to borrower works',
  pg_temp.try($q$select public.tt_hand_over((select id from public.tt_checkouts where status = 'active'), null,
     (select id from public.tt_borrowers limit 1), '4009')$q$) is null);
select pg_temp.ok('After handover: one active, held by Uncle Bob',
  (select count(*) from public.tt_checkouts where status = 'active') = 1
  and (select holder_name from public.tt_checkouts where status = 'active') = 'Uncle Bob'
  and (select count(*) from public.tt_checkouts where status = 'handed_over') = 1);
select pg_temp.ok('Tool points at the new check-out',
  (select current_checkout_id from public.tt_tools) = (select id from public.tt_checkouts where status = 'active'));
select pg_temp.ok('Return works',
  pg_temp.try($q$update public.tt_checkouts set status = 'returned', return_condition = 'damaged' where status = 'active'$q$) is null);
select pg_temp.ok('Damaged return flags maintenance', (select status from public.tt_tools) = 'maintenance_required');
select pg_temp.ok('Cannot set checked_out without a check-out',
  pg_temp.try($q$update public.tt_tools set status = 'checked_out'$q$) is not null);
select pg_temp.ok('Admin sees audit trail', (select count(*) from public.tt_audit_log) >= 4,
  (select string_agg(action, ',' order by id) from public.tt_audit_log));

-- 6. Admin rules
select pg_temp.ok('Admin cannot demote self',
  pg_temp.try($q$update public.tt_members set role = 'worker' where user_id = '00000000-0000-0000-0000-00000000000a'$q$) is not null);
select pg_temp.ok('Admin can promote worker',
  pg_temp.try($q$update public.tt_members set role = 'site_manager' where user_id = '00000000-0000-0000-0000-0000000000a2'$q$) is null);
select pg_temp.ok('Bad role rejected',
  pg_temp.try($q$update public.tt_members set role = 'superuser' where user_id = '00000000-0000-0000-0000-0000000000a2'$q$) is not null);

-- 7. Deactivated member loses access straight away
update public.tt_members set is_active = false where user_id = '00000000-0000-0000-0000-0000000000a2';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select pg_temp.ok('Deactivated member sees nothing', (select count(*) from public.tt_tools) = 0);

-- 8. Lapsed trial: read yes, write no
reset role;
update public.tt_subscriptions set status = 'trial', trial_ends_at = now() - interval '1 day' where company_id = (select a from ids where a is not null);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok('Lapsed: can still read tools', (select count(*) from public.tt_tools) = 1);
select pg_temp.ok('Lapsed: cannot add tools',
  pg_temp.try(format('insert into public.tt_tools (company_id, asset_id, description) values (%L, ''SAW-1'', ''Saw'')', (select a from ids where a is not null))) is not null);

-- 9. Storage: own company folder only
reset role;
update public.tt_subscriptions set status = 'active' where company_id = (select a from ids where a is not null);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok('Upload to own company folder',
  pg_temp.try(format('insert into storage.objects (bucket_id, name) values (''tool-tracker'', %L)', (select a from ids where a is not null) || '/tools/x/photo.jpg')) is null);
select pg_temp.ok('Upload to other company folder blocked',
  pg_temp.try(format('insert into storage.objects (bucket_id, name) values (''tool-tracker'', %L)', (select b from idsb) || '/tools/x/photo.jpg')) is not null);
select pg_temp.ok('Upload with junk path blocked',
  pg_temp.try($q$insert into storage.objects (bucket_id, name) values ('tool-tracker', '../etc/passwd')$q$) is not null);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.ok('B cannot see A files', (select count(*) from storage.objects) = 0);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ff');
select pg_temp.ok('Stranger sees no companies', (select count(*) from public.tt_companies) = 0);

reset role;
\set QUIET off
select n, case when pass then 'ok' else 'FAIL' end as result, test, detail from results order by n;
select count(*) filter (where not pass) as failures, count(*) as total from results;
