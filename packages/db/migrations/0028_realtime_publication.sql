-- 0028 — publish the six read tables to Realtime.
--
-- WHAT THIS DOES
-- Adds six existing tables to the `supabase_realtime` publication, so
-- Postgres streams their row changes to subscribed clients. That is the whole
-- change. It creates nothing, drops nothing, alters no column, writes no row
-- and touches no policy.
--
-- WHY
-- The supervisor app is now local-first: every screen reads the device's own
-- IndexedDB copy rather than querying the server, which is what makes it work
-- with no signal and what removed a network round trip from every
-- navigation. A copy is only worth reading if it is current, and these six
-- tables are what "current" means for a supervisor in the field:
--
--   trainees          a trainee added, corrected, or moved off the route
--   assignments       this supervisor's assessor slot, granted or withdrawn
--   instruments       an instrument's label or maximum
--   criteria          the criterion rows the marking form is built from
--   assessment_marks  the OTHER assessor submitting their half
--   results           locked_at, once both assessors are in
--
-- `assessment_marks` and `results` are the pair that matter most day to day.
-- When the second assessor submits, the first assessor's phone must stop
-- saying "awaiting 2nd assessor" without them thinking to reopen the app.
--
-- `reports` is deliberately NOT published. The only rows a supervisor can
-- have are ones their own device just created by sending a report, so a
-- socket message would tell it something it already knows; the next full sync
-- carries it. (apps/web/src/lib/sync/realtime-plan.ts keeps its subscription
-- list to exactly the six below, and a unit test asserts the two agree —
-- subscribing to an unpublished table is silent, with no error and no
-- events, so a drift here would be found in a village rather than in CI.)
--
-- SECURITY
-- Publication membership is not a grant. Realtime re-runs each table's
-- SELECT policy for every subscriber, so a supervisor's socket carries their
-- own route and nothing else — the same rows the same person could already
-- read with a query, arriving by a different transport. No policy is created,
-- altered or relaxed here, and `assessment_marks_select`'s two-slot gate
-- (migration 0001) still applies: assessor 2 cannot see assessor 1's marks
-- over the socket any more than over a query, because it is the same policy
-- doing the deciding.
--
-- IDEMPOTENT, AND SAFE ON A PLAIN POSTGRES
-- `add table` errors if the table is already a member, so each is guarded.
-- Re-running this migration is a no-op.
--
-- The whole block is also skipped when `supabase_realtime` does not exist at
-- all, which is the case in CI: the pgTAP job applies every migration to a
-- stock postgres:16 container, and that publication is created by Supabase's
-- own Realtime setup, not by this schema. Without the guard this migration
-- would fail the build on a database where it has nothing to do.

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime publication not present; skipping (not a Supabase database)';
    return;
  end if;

  foreach t in array array[
    'trainees',
    'assignments',
    'instruments',
    'criteria',
    'assessment_marks',
    'results'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

-- PROOF IT WORKED (AGENTS.md: every data migration ships with the query that
-- proves it). Expect exactly these six rows.
--
--   select tablename
--   from pg_publication_tables
--   where pubname = 'supabase_realtime' and schemaname = 'public'
--   order by tablename;
--
--   assessment_marks
--   assignments
--   criteria
--   instruments
--   results
--   trainees
