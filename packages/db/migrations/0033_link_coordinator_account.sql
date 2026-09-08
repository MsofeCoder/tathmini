-- Records the College's Assessment Coordinator in the migration history.
--
-- ALREADY TRUE IN PRODUCTION, and applying this changes nothing there. The
-- account was created directly in Supabase on 2026-09-08 at 01:09 UTC — the
-- Auth identity and the `users` row both — before this file existed. The
-- NOT EXISTS guard makes it a no-op against the live database; it is here so a
-- restored or scratch database rebuilds the same account instead of silently
-- having no Coordinator at all.
--
-- Safe to apply, and worth applying, precisely because it does nothing.
--
-- WHY IT MATTERS THAT THIS IS WRITTEN DOWN
--
-- The `coordinator` role has been in the schema since 0000 and named in the
-- USING clause of every select policy since 0001, and its screens have been
-- deployed since PR #40 — but until this account, no one held the role. It is
-- the first and only holder, so a restore that missed it would look complete
-- while quietly locking the Coordinator out.
--
-- WHAT IT DOES TO EXISTING ROWS
--
-- Nothing. One guarded INSERT of one row, the same pattern as the roster
-- imports and 0010. It creates no route, no assignment and no trainee, because
-- a coordinator has none: the role reads the whole cohort through
-- `is_coordinator()`, not through `assignments`.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--
-- * No grant, policy or role change of any kind. A coordinator can already
--   read everything and write nothing, and that is the entire security model
--   for this account. If it needed a new policy to be useful, something would
--   be wrong with the premise.
-- * It does not touch `RESULT_COORDINATOR_EMAIL`. Who receives a result report
--   stays configuration in the deployed app (recipients.ts) — widening
--   `users_select` so a supervisor could look the Coordinator up would expose
--   every staff address to every supervisor.
-- * It writes NO real address into `users.email`. That column is the sign-in
--   identifier mirroring auth.users.email; 0022 wrote real addresses there and
--   0027 had to undo it across the whole staff list. A reachable address for
--   this account, if the College wants one on file, goes into `contact_email`
--   through the admin console.
--
-- The live row has `must_change_password = true`, so the password issued to
-- Lymo is good for exactly one sign-in. That forced change used to land every
-- account on /home, the supervisor field app; landingPathForRole() in
-- apps/web/src/lib/auth.ts, added alongside this migration, sends a
-- coordinator to /coordinator instead. Deploy that before handing over the
-- credentials.
--
-- The join is on auth.users, so if this is ever run against a database where
-- the Auth identity does not exist, it inserts nothing rather than failing —
-- create the identity first (`pnpm --filter @tathmini/db create:accounts`,
-- which reports this one as skipped_existing against production).

insert into users (id, role, name, email)
select au.id, v.role::app_role, v.name, v.email
from (values
  ('hoe.lymo@tathmini.internal', 'coordinator', 'Lymo')
) as v(email, role, name)
join auth.users au on au.email = v.email
where not exists (select 1 from users u where u.id = au.id);
