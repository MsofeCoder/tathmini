-- Lets each assessor store their OWN result report without waiting for the
-- other. The College's requirement, decided 2026-09-05: a supervisor who is
-- sick, travelling or unreachable would otherwise block their colleague's
-- submission outright, because 0014's insert policy demanded a locked result
-- (both assessors in on every instrument). A trainee now receives one report
-- per assessor.
--
-- Replaces ONLY the insert policy from 0014. reports_select is untouched, and
-- so is every policy on assessment_marks — in particular the
-- submitted_slot_count(...) >= 2 gate that stops assessor 2 reading assessor
-- 1's marks before both submit. This migration does not widen what anyone can
-- READ; it widens when someone may store a report of their own work.
--
-- What replaces "the result is locked":
--   1. the caller owns the row (generated_by_id = auth.uid()), unchanged;
--   2. the caller is assigned to the trainee, unchanged;
--   3. the caller has a SUBMITTED mark for EVERY instrument in the trainee's
--      track — i.e. their own half is genuinely finished. A TP report missing
--      its Practical half is not a VETA document, and reports are
--      append-only like the marks behind them, so a premature one cannot be
--      corrected in place.
--
-- Coordinators and super_admins keep an unconditional insert path, as in
-- 0014 — they are not assessors and have no slot of their own to complete.

drop policy if exists reports_insert on reports;

create policy reports_insert on reports for insert to authenticated
  with check (
    generated_by_id = auth.uid()
    and (
      is_coordinator()
      or is_super_admin()
      or (
        is_assigned_to_trainee(trainee_id)
        and not exists (
          -- Any instrument in this trainee's track with no submitted mark
          -- from this caller means their own assessment is unfinished.
          select 1
          from instruments i
          where i.track = (select t.track from trainees t where t.id = reports.trainee_id)
            and not exists (
              select 1
              from assessment_marks am
              where am.trainee_id = reports.trainee_id
                and am.instrument_id = i.id
                and am.supervisor_id = auth.uid()
                and am.submitted_at is not null
            )
        )
      )
    )
  );
