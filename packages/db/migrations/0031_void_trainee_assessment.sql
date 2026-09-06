-- Returns one assessed trainee to "Not yet assessed", so they can be marked
-- again from the beginning.
--
-- NOT APPLIED. Review this, then apply it in the SQL editor. Until it is
-- applied the console's "Void this assessment" card says so plainly and does
-- nothing — it does not fail halfway.
--
-- WHY THIS EXISTS
--
-- A supervisor marks the wrong trainee, or marks the right trainee against the
-- wrong instrument, and presses submit. Today nothing in the product can undo
-- that: `assessment_marks` has no UPDATE grant and no DELETE grant, the result
-- row locks the moment both slots are in, and the trainee reads "✓ Assessed"
-- for ever with marks that belong to somebody else. The only remedy was a
-- hand-written migration against production.
--
-- WHY A VOID AND NOT A DELETE
--
-- AGENTS.md rule 2 is that a submitted mark is append-only, and that rule is
-- the point of the project: a disputed grade must be reconstructible months
-- later, which is precisely what the paper system could not do. So this does
-- not destroy the assessment. It ARCHIVES it, whole — every mark, every
-- criterion score, every comment, the computed result and every report ever
-- generated from it — into `voided_assessments`, and only then clears the live
-- rows so the trainee can be marked again.
--
-- The live rows have to go rather than be flagged, because everything
-- downstream keys off their presence:
-- `assessment_marks_trainee_instrument_slot_idx` is unique, so the same slot
-- cannot submit twice; `validate_and_finalize_mark()` refuses to touch a mark
-- that is already submitted; and `deriveStatus()` in the app reads
-- `results.locked_at`. A "voided" flag column would need an UPDATE grant on
-- `assessment_marks` — the one thing rule 2 forbids — and every one of those
-- checks would then have to learn about it. Copy, then clear, leaves the grant
-- table exactly as it is.
--
-- WHAT IT DOES NOT TOUCH
--
--   assignments   the trainee keeps their route and both assessors; they are
--                 the people who now have to mark again.
--   trainees      the register entry is untouched. This is not a deletion.
--   audit_log     append-only, as always; a VOID_ASSESSMENT entry is added.
--   Storage       the PDF files STAY in the private `reports` bucket. The
--                 report ROWS are cascade-deleted with the result, but a
--                 report that has already been e-mailed to a trainee is a
--                 thing that happened, and the file is the only copy of what
--                 they received. `reports_bucket_select` (0014) keys off the
--                 trainee-id folder, not the result row, so a Super
--                 Administrator can still read it; the archive keeps the path
--                 and the SHA-256 alongside.
--
-- WHAT IT CLEARS, and what that cascades to:
--   assessment_marks                       every mark for the trainee
--     -> assessment_mark_items             ON DELETE CASCADE
--     -> assessment_mark_section_comments  ON DELETE CASCADE
--   results                                the computed result row
--     -> reports                           ON DELETE CASCADE (rows only)
--     -> result_revisions                  ON DELETE CASCADE
--
-- Note that `assessment_marks_recompute_result` fires on INSERT and UPDATE
-- only, never on DELETE, so removing the marks does NOT recompute the result.
-- Clearing the result row explicitly is what actually returns the trainee to
-- "Not yet assessed" — the app renders "No result row yet" for a trainee with
-- no `results` row, which is the pre-assessment state exactly.

-- ══════════════════════════════════════════════════════════════════════
-- Run this first, on its own, and read it
-- ══════════════════════════════════════════════════════════════════════
--
--   select t.name, t.registration_number, t.track, r.code as route,
--          (select count(*) from assessment_marks m where m.trainee_id = t.id) as marks,
--          (select count(*) from reports rp where rp.trainee_id = t.id) as reports,
--          res.total, res.pct, res.grade, res.competent, res.locked_at
--   from trainees t
--   left join routes r on r.id = t.route_id
--   left join results res on res.trainee_id = t.id
--   where t.id = '<the trainee id>';
--
-- Confirm it is the right person before anything is voided. This function
-- takes a trainee id, not a pattern: unlike purge_test_trainees() there is no
-- predicate protecting it, because the whole point is that it acts on one real
-- trainee. The typed reason, the named actor and the full snapshot are the
-- protection.

-- ══════════════════════════════════════════════════════════════════════
-- The archive
-- ══════════════════════════════════════════════════════════════════════

create table voided_assessments (
  id uuid primary key default gen_random_uuid(),
  trainee_id uuid not null references trainees(id) on delete cascade,
  -- Denormalised so the archive still reads as a sentence if the register
  -- entry is later corrected: this records what was voided, as it stood.
  trainee_name text not null,
  track track_type not null,
  route_code text,
  marks_voided integer not null,
  reports_voided integer not null,
  -- The result as it stood, so the console can show what the record said
  -- before it was cleared without anyone opening the snapshot.
  result_total numeric(5, 2),
  result_pct numeric(5, 2),
  result_grade text,
  result_competent boolean,
  was_locked_at timestamptz,
  reason text not null,
  voided_by_id uuid not null references users(id),
  voided_at timestamptz not null default now(),
  -- Everything that was cleared, whole: marks with their criterion scores and
  -- comments, the result, its revisions, and every report row with its hash.
  snapshot jsonb not null,

  constraint voided_assessments_reason_not_empty check (length(btrim(reason)) > 0)
);

create index voided_assessments_trainee_idx on voided_assessments (trainee_id);

alter table voided_assessments enable row level security;

-- Coordinator and Super Administrator only — deliberately NOT the trainee's
-- assessors. A snapshot holds BOTH slots' marks, and after a void those
-- assessors are the people about to mark the trainee again. Letting assessor 2
-- read assessor 1's voided scores would defeat the independence rule
-- (AGENTS.md rule 4) by the back door, on the one occasion it matters most.
-- A supervisor simply sees the trainee back in their list, unmarked.
create policy voided_assessments_select on voided_assessments for select to authenticated
  using (is_coordinator() or is_super_admin());

-- No insert, update or delete policy for any role: the only way a row gets
-- here is void_trainee_assessment() below, and nothing removes one. Append-only
-- for the same reason the marks it holds were.
revoke insert, update, delete on voided_assessments from authenticated;

create trigger voided_assessments_audit
  after insert on voided_assessments
  for each row execute function log_audit();

-- ══════════════════════════════════════════════════════════════════════
-- The one narrow exception to the delete revocations
-- ══════════════════════════════════════════════════════════════════════
--
-- `delete on results` is revoked from `authenticated` in 0001, and
-- `assessment_marks` has neither an UPDATE nor a DELETE grant. All of that
-- stays. SECURITY DEFINER runs this body as the table owner, so the function is
-- the only route through — and it cannot clear anything it has not first
-- copied into the archive, because both happen in one transaction.

create or replace function void_trainee_assessment(p_trainee_id uuid, p_reason text)
returns table (
  voided_id uuid,
  marks_voided integer,
  reports_voided integer,
  was_locked boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trainee record;
  v_route_code text;
  v_result record;
  v_marks integer := 0;
  v_reports integer := 0;
  v_snapshot jsonb;
  v_id uuid;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  -- SECURITY DEFINER bypasses RLS, so the role check is this function's own
  -- responsibility and comes before anything else.
  if not is_super_admin() then
    raise exception 'Only a Super Administrator may void an assessment'
      using errcode = 'insufficient_privilege';
  end if;

  -- The same floor the console applies, enforced here too: the console is not
  -- the only possible caller, and "fix" is not a reason anyone can audit six
  -- months later.
  if length(v_reason) < 8 then
    raise exception 'A void needs a written reason of at least 8 characters';
  end if;

  select t.id, t.name, t.track, t.route_id into v_trainee
  from trainees t where t.id = p_trainee_id;
  if not found then
    raise exception 'No such trainee: %', p_trainee_id;
  end if;

  select r.code into v_route_code from routes r where r.id = v_trainee.route_id;

  select * into v_result from results where trainee_id = p_trainee_id;

  -- Counted before the clear, because afterwards there is nothing to count.
  select count(*) into v_marks from assessment_marks where trainee_id = p_trainee_id;
  select count(*) into v_reports from reports where trainee_id = p_trainee_id;

  if v_marks = 0 and v_result is null then
    raise exception 'That trainee has nothing to void — they are not assessed';
  end if;

  select jsonb_build_object(
    'schema_version', 1,
    'trainee', (
      select to_jsonb(x) from (
        select id, name, registration_number, track, course, occupation,
               institution, mode_of_study, district, region, route_id
        from trainees where id = p_trainee_id
      ) x
    ),
    'marks', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'mark', to_jsonb(m),
          'items', coalesce((
            select jsonb_agg(to_jsonb(i) order by i.created_at)
            from assessment_mark_items i where i.assessment_mark_id = m.id
          ), '[]'::jsonb),
          'section_comments', coalesce((
            select jsonb_agg(to_jsonb(sc) order by sc.section_code)
            from assessment_mark_section_comments sc
            where sc.assessment_mark_id = m.id
          ), '[]'::jsonb)
        )
        order by m.created_at
      )
      from assessment_marks m where m.trainee_id = p_trainee_id
    ), '[]'::jsonb),
    'result', (select to_jsonb(r) from results r where r.trainee_id = p_trainee_id),
    'result_revisions', coalesce((
      select jsonb_agg(to_jsonb(rv) order by rv.created_at)
      from result_revisions rv
      join results r2 on r2.id = rv.result_id
      where r2.trainee_id = p_trainee_id
    ), '[]'::jsonb),
    -- Path and hash kept because the FILES are not deleted: this is how a
    -- voided report is found again in the bucket.
    'reports', coalesce((
      select jsonb_agg(to_jsonb(rp) order by rp.generated_at)
      from reports rp where rp.trainee_id = p_trainee_id
    ), '[]'::jsonb)
  ) into v_snapshot;

  insert into voided_assessments (
    trainee_id, trainee_name, track, route_code, marks_voided, reports_voided,
    result_total, result_pct, result_grade, result_competent, was_locked_at,
    reason, voided_by_id, snapshot
  ) values (
    p_trainee_id, v_trainee.name, v_trainee.track, v_route_code, v_marks, v_reports,
    v_result.total, v_result.pct, v_result.grade, v_result.competent, v_result.locked_at,
    v_reason, auth.uid(), v_snapshot
  )
  returning id into v_id;

  -- Cascades to assessment_mark_items and assessment_mark_section_comments.
  delete from assessment_marks where trainee_id = p_trainee_id;

  -- Cascades to reports (rows) and result_revisions. Necessary, not
  -- incidental: recompute_result() has no DELETE trigger, so without this the
  -- trainee would keep a locked result computed from marks that no longer
  -- exist.
  delete from results where trainee_id = p_trainee_id;

  -- The per-row trigger on `voided_assessments` files the archive row itself.
  -- This is the line a human reads in the audit trail: who returned whom to
  -- unassessed, and why.
  insert into audit_log (actor_id, action, target_table, target_id, detail)
  values (
    auth.uid(),
    'VOID_ASSESSMENT',
    'trainees',
    p_trainee_id,
    format(
      '%s (%s): %s %s and %s %s voided, result cleared. Reason: %s',
      v_trainee.name,
      coalesce(v_route_code, 'no route'),
      v_marks, case when v_marks = 1 then 'mark' else 'marks' end,
      v_reports, case when v_reports = 1 then 'report row' else 'report rows' end,
      v_reason
    )
  );

  voided_id := v_id;
  marks_voided := v_marks;
  reports_voided := v_reports;
  was_locked := v_result.locked_at is not null;
  return next;
end;
$$;

comment on function void_trainee_assessment(uuid, text) is
  'Archives one trainee''s marks, result and reports into voided_assessments, then clears the live rows so they can be assessed again. Super Administrator only; requires a written reason; never touches the register entry, the route or the assessor assignments.';

revoke all on function void_trainee_assessment(uuid, text) from public;
-- `from public` removes the PUBLIC pseudo-role but NOT the explicit grants
-- Supabase's default privileges hand to anon and service_role when a function
-- is created. Applying this migration and then reading
-- information_schema.routine_privileges showed `anon:EXECUTE` still standing —
-- harmless (is_super_admin() returns false when auth.uid() is null, so an
-- anonymous call raises insufficient_privilege before it reads a row) but wrong:
-- the only route to clearing a mark should not be callable by a role that can
-- never be allowed to use it. purge_test_trainees() (0029) carries no anon
-- grant, and this now matches it.
-- Guarded because `anon` is a Supabase role: it does not exist in the plain
-- Postgres container the pgTAP CI job builds, and an unguarded REVOKE there
-- fails the whole run on ON_ERROR_STOP.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function void_trainee_assessment(uuid, text) from anon';
  end if;
end
$$;

grant execute on function void_trainee_assessment(uuid, text) to authenticated;

-- ══════════════════════════════════════════════════════════════════════
-- Prove it worked
-- ══════════════════════════════════════════════════════════════════════
--
--   select count(*) from assessment_marks where trainee_id = '<id>';  -- expect 0
--   select count(*) from results          where trainee_id = '<id>';  -- expect 0
--
--   select trainee_name, marks_voided, reports_voided, result_grade,
--          was_locked_at, reason, voided_at
--   from voided_assessments where trainee_id = '<id>';
--   -- expect one row naming what was cleared
--
--   select jsonb_array_length(snapshot->'marks') from voided_assessments
--   where trainee_id = '<id>';
--   -- expect the same number as marks_voided
--
--   select actor_id, action, detail from audit_log
--   where action = 'VOID_ASSESSMENT' order by created_at desc limit 1;
--
-- Then open the trainee in the console: the status reads "Not yet assessed",
-- the marks table is empty, and both assessors can mark them again.
