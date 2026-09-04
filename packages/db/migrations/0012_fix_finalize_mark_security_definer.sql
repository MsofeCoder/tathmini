-- Fixes validate_and_finalize_mark() (0001_rls_and_functions.sql) — found
-- the hard way running the very first live submission through the new
-- marking flow (see MEMORY.md).
--
-- The function updates assessment_marks (total, submitted_at) once a
-- complete set of assessment_mark_items lands, but was never declared
-- `security definer` — unlike its sibling recompute_result(), which
-- correctly is. It therefore ran as the invoking `authenticated` role,
-- which has UPDATE revoked on assessment_marks by design (AGENTS.md rule
-- 2: marks are append-only, no role gets an UPDATE grant). Every real
-- submission attempt has been failing at the finalize step with
-- "permission denied for table assessment_marks" — the assessment_mark_items
-- insert itself succeeds (that table's grants are fine), so a caller sees
-- items land but the mark never gets its total/submitted_at stamped, and
-- results never recomputes. This was never caught earlier because no UI
-- ever exercised the two-insert contract against the real database before
-- now; the throwaway local Postgres 16 verification predates the REVOKE
-- being added to this same file, and the pgTAP suite proves REVOKE
-- separately from proving a real submission finalizes.
--
-- Fix: give validate_and_finalize_mark() the same `security definer set
-- search_path = public` attribute recompute_result() already has, so it
-- runs with the privilege to perform the update its own logic already
-- gates correctly (rejects an already-submitted mark, rejects an
-- incomplete item count) — same pattern as 0004's fix to chain_audit_log().

create or replace function validate_and_finalize_mark()
returns trigger
language plpgsql
security definer
set search_path = public
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
