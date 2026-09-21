-- What a supervisor's results spreadsheet is allowed to read.
--
-- NOT APPLIED BY THIS FILE. Review, then apply in the SQL editor.
--
-- WHY THIS EXISTS
--
-- `/api/reports/route-results` builds a supervisor's own routes as an .xlsx.
-- Read through the plain table policies it comes out with two holes, both
-- visible in the first real download (IPT ROUTE 5, 21 September):
--
--   1. The ASSESSOR 2 banner said "ASSESSOR 2" and no name. `users_select`
--      allows `id = auth.uid()` and nothing else, so a supervisor can read
--      their own row and no colleague's. The embedded `users(name)` came back
--      null for every mark the other assessor submitted.
--
--   2. Two trainees showed an AVERAGE with both assessor blocks empty.
--      `assessment_marks_select` withholds the other slot until both have
--      submitted, but `results_select` has no such gate and
--      `recompute_result()` writes a provisional average over whatever marks
--      exist. With one mark that average IS that mark — so the sheet printed
--      Fausta Makweta's 59.00 and 54.00 to Coletha Ndelwa, who had not marked
--      those trainees yet. The number was hidden in one column and published
--      in the next.
--
-- WHAT THE COLLEGE DECIDED, 21 September 2026
--
-- Show both assessors' marks and both names in the spreadsheet. The export is
-- a summary of work already done, and a sheet that hides half its own
-- arithmetic is worse than one that shows it — a blank beside a filled
-- average is read as lost marks, and generates exactly the support call the
-- file was meant to prevent.
--
-- THIS OVERTURNS AN EARLIER DECISION, DELIBERATELY. CONTEXT.md § "Decisions
-- already made" records assessor independence as "Assessor 2 must not be able
-- to see Assessor 1's marks before both submit. Enforce in the database," and
-- AGENTS.md rule 4 says the same. That still holds everywhere else; it does
-- not hold in this export. A supervisor who downloads before marking will see
-- their colleague's scores. That is the cost, it was accepted knowingly by the
-- Super Administrator, and it is written down here rather than discovered
-- later in a diff.
--
-- WHY A FUNCTION AND NOT A RELAXED POLICY
--
-- Dropping the `submitted_slot_count(...) >= 2` branch from
-- `assessment_marks_select` would open the other slot to EVERY read in the
-- app — including the marking screen, where independence is the entire point.
-- A SECURITY DEFINER function opens exactly one door: this export, for routes
-- the caller is actually on, returning marks and names and nothing else.
-- `assessment_marks_select`, `users_select` and `results_select` are untouched
-- and keep protecting every other screen.
--
-- Widening `users_select` instead was rejected for a second reason: RLS is
-- row-level, so granting a colleague's row also grants `users.email`, which
-- is the synthetic `firstname.lastname@tathmini.internal` sign-in identifier —
-- a colleague's username. These functions return `name` and no other column.
--
-- REVERSING IT
--
--   drop function if exists route_results_marks();
--   drop function if exists route_assessor_names();
--
-- Nothing else changes, no row is written, and the export falls back to the
-- blanks it printed before.

-- ── Submitted marks for the caller's own routes ───────────────────────
--
-- Submitted only: a draft is not a result and must never reach a College
-- spreadsheet. Scoped by `assignments`, so a supervisor sees the trainees
-- they hold a slot for and no one else's; coordinators and super
-- administrators already read these tables directly and are included so the
-- same export can serve them later.
create or replace function route_results_marks()
returns table (
  trainee_id uuid,
  slot assessor_slot,
  instrument_code text,
  total numeric,
  assessed_on date,
  submitted_on date,
  supervisor_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.trainee_id,
    m.slot,
    i.code,
    m.total,
    m.assessed_on,
    m.submitted_at::date,
    u.name
  from assessment_marks m
  join instruments i on i.id = m.instrument_id
  join users u on u.id = m.supervisor_id
  where m.submitted_at is not null
    and (
      is_coordinator()
      or is_super_admin()
      or exists (
        select 1 from assignments a
        where a.trainee_id = m.trainee_id
          and a.supervisor_id = auth.uid()
      )
    );
$$;

-- `submitted_on` rides along because 326 of 1 539 marks carry no
-- `assessed_on`: 165 were submitted before 0034 added the column and can
-- never have one, and 161 were submitted after it with the field left blank.
-- The export prints the submission date for those rather than inventing a
-- day, which is what the report did before 0034 anyway.

-- ── The two assessors named on a route ────────────────────────────────
--
-- Needed for the banner when an assessor has not marked anybody yet: with no
-- marks of theirs in the export, there is no row to carry their name.
create or replace function route_assessor_names()
returns table (
  route_id uuid,
  a1_name text,
  a2_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    (select u.name from users u where u.id = r.supervisor_a1_id),
    (select u.name from users u where u.id = r.supervisor_a2_id)
  from routes r
  where is_coordinator()
     or is_super_admin()
     or r.supervisor_a1_id = auth.uid()
     or r.supervisor_a2_id = auth.uid();
$$;

-- SECURITY DEFINER functions are executable by PUBLIC unless told otherwise,
-- and on a Supabase project that reaches `anon` — the role an
-- unauthenticated visitor carries. Both of these read `auth.uid()`, which is
-- null for anon, so they would return nothing; that is luck, not a boundary.
--
-- `revoke ... from public` is NOT enough, and this was verified the hard way:
-- after revoking from PUBLIC, `has_function_privilege('anon', ...)` was still
-- true. Supabase grants EXECUTE to `anon` and `authenticated` DIRECTLY (its
-- default privileges on the public schema), and a direct grant is not removed
-- by revoking the same privilege from PUBLIC. Name anon explicitly.
revoke execute on function route_results_marks() from public, anon;
revoke execute on function route_assessor_names() from public, anon;
grant execute on function route_results_marks() to authenticated;
grant execute on function route_assessor_names() to authenticated;
