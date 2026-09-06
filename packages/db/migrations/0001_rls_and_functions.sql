-- Tathmini · Phase 0 · RLS, grading functions, and integrity triggers
--
-- Companion to 0000_perfect_venom.sql (table DDL, drizzle-kit generated).
-- This file is hand-written: RLS policies, PL/pgSQL functions and triggers
-- are not modelled in Drizzle's schema.ts. NOT YET APPLIED to any database —
-- no Supabase project is connected from this session. Shown here per
-- PLAN.md 0.2/0.3 ("show the SQL and wait").
--
-- Design principle throughout (AGENTS.md "four rules that are the point of
-- this project"): every guarantee below is enforced by Postgres — RLS,
-- constraints, triggers, REVOKEs — never trusted from application code.

create extension if not exists pgcrypto;

-- ── users ↔ auth.users ────────────────────────────────────────────
-- Deferred to this file because schema.ts has no model of the `auth` schema.
alter table "users"
  add constraint "users_id_auth_users_id_fk"
  foreign key ("id") references auth.users(id) on delete cascade;

-- ── Grading functions (mirrors packages/shared/src/grading.ts exactly) ──
-- IMMUTABLE so they can be called from a generated/trigger-maintained
-- column expression. Boundaries verbatim from CONTEXT.md's grading key.

create or replace function veta_pct(p_total numeric, p_max numeric)
returns numeric
language sql
immutable
as $$
  select case
    when p_total is null then null
    when p_max = 0 then 0
    else round((p_total / p_max) * 100, 2)
  end;
$$;

create or replace function veta_grade(p_pct numeric)
returns text
language sql
immutable
as $$
  select case
    when p_pct is null then null
    when p_pct >= 80 then 'A'
    when p_pct >= 65 then 'B'
    when p_pct >= 50 then 'C'
    when p_pct >= 40 then 'D'
    else 'F'
  end;
$$;

create or replace function veta_gpa(p_pct numeric, p_grade text)
returns numeric
language sql
immutable
as $$
  select round(
    (case p_grade
      when 'A' then least(4.0, 3.5 + ((p_pct - 80) / (100 - 80)) * (4.0 - 3.5))
      when 'B' then 3.0 + ((p_pct - 65) / (79.999 - 65)) * (3.4 - 3.0)
      when 'C' then 2.0 + ((p_pct - 50) / (64.999 - 50)) * (2.9 - 2.0)
      else null
    end)::numeric, 1
  );
$$;

create or replace function veta_class_of_award(p_grade text)
returns text
language sql
immutable
as $$
  select case p_grade
    when 'A' then 'First Class'
    when 'B' then 'Second Class'
    when 'C' then 'Pass'
    else null
  end;
$$;

-- ── Role and assignment helpers (SECURITY DEFINER: read public.users /
-- assignments with elevated privilege so RLS policies can call them
-- without recursing through the very policies they are evaluating) ──

create or replace function current_app_role()
returns app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from users where id = auth.uid();
$$;

create or replace function is_coordinator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(current_app_role() = 'coordinator', false);
$$;

create or replace function is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(current_app_role() = 'super_admin', false);
$$;

create or replace function is_assigned_to_trainee(p_trainee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from assignments
    where trainee_id = p_trainee_id and supervisor_id = auth.uid()
  );
$$;

-- Number of submitted assessment_marks rows for a (trainee, instrument)
-- pair. Used only to test ">= 2", never to leak scores.
create or replace function submitted_slot_count(p_trainee_id uuid, p_instrument_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from assessment_marks
  where trainee_id = p_trainee_id
    and instrument_id = p_instrument_id
    and submitted_at is not null;
$$;

-- ── criteria: section maxima must sum to the instrument's max_total ──
-- PLAN.md 0.2: "pgTAP: inserting a mismatched set fails".

create or replace function validate_instrument_maxima()
returns trigger
language plpgsql
as $$
declare
  rec record;
  v_sum numeric;
  v_expected numeric;
begin
  for rec in select distinct instrument_id from new_criteria loop
    select sum(section_max) into v_sum
    from (
      select distinct on (section_code) section_code, section_max
      from criteria
      where instrument_id = rec.instrument_id
    ) sections;

    select max_total into v_expected from instruments where id = rec.instrument_id;

    if v_sum is distinct from v_expected then
      raise exception
        'criteria section maxima for instrument % sum to %, expected %',
        rec.instrument_id, v_sum, v_expected;
    end if;
  end loop;
  return null;
end;
$$;

-- Postgres forbids a transition table on a trigger spanning more than one
-- event, so insert and update each get their own trigger.
create trigger criteria_validate_maxima_ins
  after insert on criteria
  referencing new table as new_criteria
  for each statement
  execute function validate_instrument_maxima();

create trigger criteria_validate_maxima_upd
  after update on criteria
  referencing new table as new_criteria
  for each statement
  execute function validate_instrument_maxima();

-- ── assessment_mark_items: complete-form check + finalize the mark ──
-- PLAN.md 0.2: "pgTAP: a 36-of-37 submission is refused". A mark's items
-- must all arrive in the statement that completes it; this trigger checks
-- the count against the instrument's criteria count and, if it matches,
-- stamps assessment_marks.total and submitted_at. Otherwise the whole
-- statement — and, in the caller's transaction, the parent insert — is
-- rolled back by the raised exception.

create or replace function validate_and_finalize_mark()
returns trigger
language plpgsql
as $$
declare
  rec record;
  v_expected_count integer;
  v_actual_count integer;
  v_total numeric;
  v_already_submitted timestamptz;
begin
  for rec in select distinct assessment_mark_id from new_items loop
    select am.submitted_at into v_already_submitted
    from assessment_marks am where am.id = rec.assessment_mark_id;

    if v_already_submitted is not null then
      raise exception
        'assessment_mark % is already submitted; marks are append-only',
        rec.assessment_mark_id;
    end if;

    select count(*) into v_expected_count
    from criteria c
    join assessment_marks am on am.instrument_id = c.instrument_id
    where am.id = rec.assessment_mark_id;

    select count(*), sum(score) into v_actual_count, v_total
    from assessment_mark_items
    where assessment_mark_id = rec.assessment_mark_id;

    if v_actual_count <> v_expected_count then
      raise exception
        'assessment_mark % has % of % required criteria scored',
        rec.assessment_mark_id, v_actual_count, v_expected_count;
    end if;

    update assessment_marks
      set total = v_total, submitted_at = now()
      where id = rec.assessment_mark_id;
  end loop;
  return null;
end;
$$;

create trigger assessment_mark_items_finalize
  after insert on assessment_mark_items
  referencing new table as new_items
  for each statement
  execute function validate_and_finalize_mark();

-- ── results: recomputed whenever a mark is finalized ──────────────
-- AGENTS.md rule 3: totals/grade/GPA/verdict are computed in Postgres,
-- never accepted from a client. Averaging two slots (CONTEXT.md: "just
-- average, no flagging") happens here, to one decimal place.

create or replace function recompute_result()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trainee_id uuid;
  v_track track_type;
  v_theory_total numeric;
  v_practical_total numeric;
  v_total numeric;
  v_max numeric;
  v_pct numeric;
  v_grade text;
  v_expected_marks integer;
  v_submitted_marks integer;
begin
  v_trainee_id := coalesce(new.trainee_id, old.trainee_id);
  select track into v_track from trainees where id = v_trainee_id;

  select avg(am.total) into v_theory_total
  from assessment_marks am
  join instruments i on i.id = am.instrument_id
  where am.trainee_id = v_trainee_id and i.code = 'tp_theory' and am.submitted_at is not null;

  select avg(am.total) into v_practical_total
  from assessment_marks am
  join instruments i on i.id = am.instrument_id
  where am.trainee_id = v_trainee_id and i.code = 'tp_practical' and am.submitted_at is not null;

  select sum(max_total) into v_max from instruments where track = v_track;

  if v_track = 'IPT' then
    select avg(am.total) into v_total
    from assessment_marks am
    join instruments i on i.id = am.instrument_id
    where am.trainee_id = v_trainee_id and i.code = 'ipt' and am.submitted_at is not null;
    v_theory_total := null;
    v_practical_total := null;
  else
    if v_theory_total is null and v_practical_total is null then
      v_total := null;
    else
      v_total := coalesce(v_theory_total, 0) + coalesce(v_practical_total, 0);
    end if;
  end if;

  v_total := round(v_total::numeric, 1);
  v_pct := veta_pct(v_total, v_max);
  v_grade := veta_grade(v_pct);

  -- Locked once every instrument in the trainee's track has both slots in.
  select count(*) into v_expected_marks from instruments where track = v_track;
  v_expected_marks := v_expected_marks * 2;
  select count(*) into v_submitted_marks
  from assessment_marks am
  join instruments i on i.id = am.instrument_id
  where am.trainee_id = v_trainee_id and i.track = v_track and am.submitted_at is not null;

  insert into results (
    trainee_id, track, theory_total, practical_total, total, max,
    pct, grade, gpa, class_of_award, competent, locked_at, updated_at
  ) values (
    v_trainee_id, v_track, v_theory_total, v_practical_total, v_total, v_max,
    v_pct, v_grade, veta_gpa(v_pct, v_grade), veta_class_of_award(v_grade),
    case when v_total is null then null else v_pct >= 50 end,
    case when v_submitted_marks >= v_expected_marks then now() else null end,
    now()
  )
  on conflict (trainee_id) do update set
    theory_total = excluded.theory_total,
    practical_total = excluded.practical_total,
    total = excluded.total,
    max = excluded.max,
    pct = excluded.pct,
    grade = excluded.grade,
    gpa = excluded.gpa,
    class_of_award = excluded.class_of_award,
    competent = excluded.competent,
    locked_at = excluded.locked_at,
    updated_at = now();

  return null;
end;
$$;

create trigger assessment_marks_recompute_result
  after insert or update of total, submitted_at on assessment_marks
  for each row
  execute function recompute_result();

-- ── result_revisions: non-empty reason, append-only ────────────────
-- PLAN.md 0.2: "pgTAP: empty reason rejected".

alter table result_revisions
  add constraint result_revisions_reason_not_empty
  check (length(btrim(reason)) > 0);

-- ── audit_log: hash chain, append-only ─────────────────────────────
-- PLAN.md 0.2: "pgTAP: DELETE fails for every role".

create or replace function chain_audit_log()
returns trigger
language plpgsql
as $$
declare
  v_prev_hash text;
begin
  select hash into v_prev_hash from audit_log order by created_at desc, id desc limit 1;
  new.prev_hash := v_prev_hash;
  new.hash := encode(
    digest(
      coalesce(v_prev_hash, '') || coalesce(new.actor_id::text, '') || new.action
        || new.target_table || coalesce(new.target_id::text, '') || coalesce(new.detail, '')
        || now()::text,
      'sha256'
    ),
    'hex'
  );
  return new;
end;
$$;

create trigger audit_log_chain
  before insert on audit_log
  for each row
  execute function chain_audit_log();

create or replace function log_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into audit_log (actor_id, action, target_table, target_id)
  values (auth.uid(), tg_op, tg_table_name, coalesce(new.id, old.id));
  return coalesce(new, old);
end;
$$;

create trigger trainees_audit after insert or update or delete on trainees
  for each row execute function log_audit();
create trigger routes_audit after insert or update or delete on routes
  for each row execute function log_audit();
create trigger assignments_audit after insert or update or delete on assignments
  for each row execute function log_audit();
create trigger assessment_marks_audit after insert on assessment_marks
  for each row execute function log_audit();
create trigger result_revisions_audit after insert on result_revisions
  for each row execute function log_audit();
create trigger reassignments_audit after insert or update on reassignments
  for each row execute function log_audit();

-- ── Row Level Security: default deny on every table ───────────────

alter table users enable row level security;
alter table routes enable row level security;
alter table trainees enable row level security;
alter table instruments enable row level security;
alter table criteria enable row level security;
alter table assignments enable row level security;
alter table assessment_marks enable row level security;
alter table assessment_mark_items enable row level security;
alter table results enable row level security;
alter table result_revisions enable row level security;
alter table reassignments enable row level security;
alter table notifications enable row level security;
alter table audit_log enable row level security;

-- users: read self, or everything if coordinator/super_admin. Account
-- creation happens via the Supabase Auth Admin API (service role, bypasses
-- RLS) — see AGENTS.md "no self-registration route exists in the codebase".
create policy users_select on users for select to authenticated
  using (id = auth.uid() or is_coordinator() or is_super_admin());
create policy users_admin_write on users for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- routes: visible to its two supervisors, or admin/coordinator. Managed
-- only by super_admin (Phase 3 route management).
create policy routes_select on routes for select to authenticated
  using (
    is_coordinator() or is_super_admin()
    or supervisor_a1_id = auth.uid() or supervisor_a2_id = auth.uid()
  );
create policy routes_admin_write on routes for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- trainees: a supervisor sees only trainees they are assigned to.
create policy trainees_select on trainees for select to authenticated
  using (is_coordinator() or is_super_admin() or is_assigned_to_trainee(id));
create policy trainees_admin_write on trainees for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- instruments/criteria: reference data, readable by every authenticated
-- role so the marking form and printed report can render; writable only
-- by super_admin (criteria wording changes are rare and deliberate).
create policy instruments_select on instruments for select to authenticated using (true);
create policy instruments_admin_write on instruments for all to authenticated
  using (is_super_admin()) with check (is_super_admin());
create policy criteria_select on criteria for select to authenticated using (true);
create policy criteria_admin_write on criteria for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- assignments: a supervisor sees their own rows; writes are admin-only in
-- Phase 0 (the reassignment accept/decline flow gets its own SECURITY
-- DEFINER RPC in Phase 3, rather than a direct grant here).
create policy assignments_select on assignments for select to authenticated
  using (is_coordinator() or is_super_admin() or supervisor_id = auth.uid());
create policy assignments_admin_write on assignments for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- assessment_marks: own slot always; the other slot only once both are
-- submitted, and only for a trainee the caller is actually assigned to.
-- PLAN.md 0.3: "pgTAP: a1 in, a2 selects → 0 rows" before both submit.
create policy assessment_marks_select on assessment_marks for select to authenticated
  using (
    is_coordinator() or is_super_admin()
    or supervisor_id = auth.uid()
    or (
      submitted_at is not null
      and is_assigned_to_trainee(trainee_id)
      and submitted_slot_count(trainee_id, instrument_id) >= 2
    )
  );
-- Insert only for the caller's own declared slot, on a trainee they are
-- assigned to that slot for.
create policy assessment_marks_insert on assessment_marks for insert to authenticated
  with check (
    supervisor_id = auth.uid()
    and exists (
      select 1 from assignments a
      where a.trainee_id = assessment_marks.trainee_id
        and a.supervisor_id = auth.uid()
        and a.slot = assessment_marks.slot
    )
  );
-- No update/delete policy for any role: combined with the REVOKE below,
-- this is what "no UPDATE grant on assessment_marks for any role" means
-- (AGENTS.md rule 2) — not even super_admin edits a submitted mark in
-- place; a correction is a result_revisions row.

create policy assessment_mark_items_select on assessment_mark_items for select to authenticated
  using (
    is_coordinator() or is_super_admin()
    or exists (
      select 1 from assessment_marks am
      where am.id = assessment_mark_items.assessment_mark_id
        and (
          am.supervisor_id = auth.uid()
          or (
            am.submitted_at is not null
            and is_assigned_to_trainee(am.trainee_id)
            and submitted_slot_count(am.trainee_id, am.instrument_id) >= 2
          )
        )
    )
  );
create policy assessment_mark_items_insert on assessment_mark_items for insert to authenticated
  with check (
    exists (
      select 1 from assessment_marks am
      where am.id = assessment_mark_items.assessment_mark_id
        and am.supervisor_id = auth.uid()
        and am.submitted_at is null
    )
  );

-- results: read-scoped like trainees; never directly written by a client
-- (only the recompute_result() trigger, which runs as the table owner).
create policy results_select on results for select to authenticated
  using (is_coordinator() or is_super_admin() or is_assigned_to_trainee(trainee_id));

-- result_revisions: super_admin writes only; visible to admin/coordinator
-- and the trainee's assigned supervisors.
create policy result_revisions_select on result_revisions for select to authenticated
  using (
    is_coordinator() or is_super_admin()
    or exists (
      select 1 from results r where r.id = result_revisions.result_id
        and is_assigned_to_trainee(r.trainee_id)
    )
  );
create policy result_revisions_insert on result_revisions for insert to authenticated
  with check (is_super_admin() and acted_by_id = auth.uid());

-- reassignments: visible to both parties; Phase 3 builds the actual
-- accept/decline write path (a SECURITY DEFINER RPC, not a direct grant).
create policy reassignments_select on reassignments for select to authenticated
  using (
    is_coordinator() or is_super_admin()
    or from_supervisor_id = auth.uid() or to_supervisor_id = auth.uid()
  );
create policy reassignments_admin_write on reassignments for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- notifications: visible to admin/coordinator and whoever sent it.
create policy notifications_select on notifications for select to authenticated
  using (is_coordinator() or is_super_admin() or sent_by_id = auth.uid());
create policy notifications_insert on notifications for insert to authenticated
  with check (sent_by_id = auth.uid());

-- audit_log: read-only for coordinator/super_admin; written only by
-- log_audit() (SECURITY DEFINER, runs as owner, bypasses this policy).
create policy audit_log_select on audit_log for select to authenticated
  using (is_coordinator() or is_super_admin());

-- ── Append-only enforcement at the GRANT level (defense in depth
-- alongside the RLS policies above — AGENTS.md: "No role gets an UPDATE
-- grant" is a grant-level statement, not just a policy-level one) ──

revoke update, delete on assessment_marks from authenticated;
revoke update, delete on assessment_mark_items from authenticated;
revoke update, delete on audit_log from authenticated;
revoke delete on results from authenticated;
revoke delete on trainees from authenticated;
revoke delete on result_revisions from authenticated;
