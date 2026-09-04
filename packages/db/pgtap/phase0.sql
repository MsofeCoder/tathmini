-- Phase 0 exit-gate suite (ROADMAP.md / PLAN.md 0.2, 0.3).
--
-- Run against a fresh database that already has 0000_perfect_venom.sql,
-- 0001_rls_and_functions.sql, and a stub `auth` schema applied (see
-- packages/db/scripts/local-auth-stub.sql for local/CI use — Supabase
-- provides the real one). Every assertion here was first proven by hand
-- against a live Postgres 16 container; see MEMORY.md for that session.
--
-- select plan(N) below must match the number of assertions actually run.

begin;
select plan(15);

-- ── Fixtures ─────────────────────────────────────────────────────
insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000003'),
  ('00000000-0000-0000-0000-000000000004');

insert into users (id, role, name, email) values
  ('00000000-0000-0000-0000-000000000001', 'supervisor', 'Supervisor A1', 'a1@example.test'),
  ('00000000-0000-0000-0000-000000000002', 'supervisor', 'Supervisor A2', 'a2@example.test'),
  ('00000000-0000-0000-0000-000000000003', 'coordinator', 'Coordinator', 'coord@example.test'),
  ('00000000-0000-0000-0000-000000000004', 'super_admin', 'Admin', 'admin@example.test');

insert into routes (id, code, supervisor_a1_id, supervisor_a2_id) values
  ('10000000-0000-0000-0000-000000000001', 'ROUTE 1',
   '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002');

insert into trainees (id, name, registration_number, course, occupation, institution, email, track, route_id)
values (
  '20000000-0000-0000-0000-000000000001', 'Test Trainee', 'REG-0001', 'CAVT',
  'Electrical Installation', 'ARUSHA VTC', 'trainee@example.test', 'TP',
  '10000000-0000-0000-0000-000000000001'
);

insert into assignments (trainee_id, supervisor_id, slot) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'a1'),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'a2');

insert into instruments (id, code, label, track, max_total) values
  ('30000000-0000-0000-0000-000000000001', 'tp_theory', 'TP Theory', 'TP', 3);

insert into criteria (instrument_id, section_code, section_label, section_max, item_code, item_label, item_max, order_index)
values
  ('30000000-0000-0000-0000-000000000001', '1', 'S1', 3, 'i', 'Item i', 1.5, 1),
  ('30000000-0000-0000-0000-000000000001', '1', 'S1', 3, 'ii', 'Item ii', 1.5, 2);

-- ── 0.2 constraints ────────────────────────────────────────────────

select throws_ok(
  $$ insert into criteria (instrument_id, section_code, section_label, section_max, item_code, item_label, item_max, order_index)
     values ('30000000-0000-0000-0000-000000000001', '2', 'S2', 999, 'i', 'Bad', 1, 3) $$,
  'P0001',
  'criteria section maxima mismatch is rejected'
);

select throws_ok(
  $$ insert into assignments (trainee_id, supervisor_id, slot)
     values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'a2') $$,
  '23505',
  'one supervisor cannot hold both slots for one trainee'
);

insert into assessment_marks (id, trainee_id, instrument_id, supervisor_id, slot)
values ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
        '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'a1');

select throws_ok(
  $$ insert into assessment_marks (id, trainee_id, instrument_id, supervisor_id, slot)
     values ('40000000-0000-0000-0000-000000000099', '20000000-0000-0000-0000-000000000001',
             '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'a1') $$,
  '23505',
  'assessment_marks is unique per (trainee, instrument, slot)'
);

select throws_ok(
  $$ insert into assessment_mark_items (assessment_mark_id, criterion_id, score)
     select '40000000-0000-0000-0000-000000000001', id, item_max
     from criteria where instrument_id = '30000000-0000-0000-0000-000000000001' and item_code = 'i' $$,
  'P0001',
  'a 1-of-2 submission is refused (complete-form check)'
);

insert into assessment_mark_items (assessment_mark_id, criterion_id, score)
select '40000000-0000-0000-0000-000000000001', id, item_max
from criteria where instrument_id = '30000000-0000-0000-0000-000000000001';

select is(
  (select submitted_at is not null from assessment_marks where id = '40000000-0000-0000-0000-000000000001'),
  true,
  'a complete 2-of-2 submission is accepted and stamped submitted_at'
);

select throws_ok(
  $$ insert into result_revisions (result_id, superseded_total, new_total, reason, acted_by_id)
     select id, 0, 1, '   ', '00000000-0000-0000-0000-000000000004' from results limit 1 $$,
  '23514',
  'an empty result_revisions.reason is rejected'
);

-- Postgres forbids a data-modifying CTE nested inside a subquery, which
-- rules out `is((with u as (update ... returning 1) select count(*) ...))`
-- directly. SECURITY INVOKER (the default) so it runs as whichever role
-- called it — the RLS check under test still applies.
create or replace function _test_affected_rows(p_sql text) returns integer
language plpgsql as $$
declare
  v_count integer;
begin
  execute p_sql;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ── 0.3 RLS ──────────────────────────────────────────────────────

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
select is(
  (select count(*)::int from assessment_marks where trainee_id = '20000000-0000-0000-0000-000000000001'),
  0,
  'a2 selects a1''s submitted slot before a2 has submitted → 0 rows'
);
reset role;

insert into assessment_marks (id, trainee_id, instrument_id, supervisor_id, slot)
values ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001',
        '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'a2');
insert into assessment_mark_items (assessment_mark_id, criterion_id, score)
select '40000000-0000-0000-0000-000000000002', id, item_max
from criteria where instrument_id = '30000000-0000-0000-0000-000000000001';

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
select is(
  (select count(*)::int from assessment_marks where trainee_id = '20000000-0000-0000-0000-000000000001'),
  2,
  'once both slots submit, a2 can read both'
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
select lives_ok(
  $$ select count(*) from trainees $$,
  'coordinator can SELECT trainees'
);
select is(
  _test_affected_rows($$ update trainees set name = 'Hacked'
     where id = '20000000-0000-0000-0000-000000000001' $$),
  0,
  'coordinator UPDATE on trainees affects 0 rows (no write grant exists for that role)'
);
select throws_ok(
  $$ update assessment_marks set total = 999
     where id = '40000000-0000-0000-0000-000000000001' $$,
  '42501',
  'coordinator UPDATE on assessment_marks is denied at the grant level'
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
select throws_ok(
  $$ update assessment_marks set total = 999
     where id = '40000000-0000-0000-0000-000000000001' $$,
  '42501',
  'supervisor UPDATE on assessment_marks is denied at the grant level'
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', false);
select throws_ok(
  $$ update assessment_marks set total = 999
     where id = '40000000-0000-0000-0000-000000000001' $$,
  '42501',
  'super_admin UPDATE on assessment_marks is denied at the grant level (no role gets this grant)'
);
select throws_ok(
  $$ delete from audit_log $$,
  '42501',
  'DELETE on audit_log is denied for every role'
);
reset role;

-- Fixture-setup writes above ran as the postgres superuser with no JWT
-- claim, so they legitimately have no actor — that is not what this rule
-- is about. What matters is that a write made BY an authenticated
-- super_admin is attributed to them, specifically.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', false);
update routes set label = 'Set by admin' where id = '10000000-0000-0000-0000-000000000001';
reset role;

select is(
  (select actor_id from audit_log
     where target_table = 'routes' and action = 'UPDATE'
     order by created_at desc limit 1),
  '00000000-0000-0000-0000-000000000004'::uuid,
  'a super_admin write is attributed to them in audit_log'
);

select * from finish();
rollback;
