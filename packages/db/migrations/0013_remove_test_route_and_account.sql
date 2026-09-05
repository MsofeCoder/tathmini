-- Removes the synthetic test data seeded by 0011 and the dev account
-- linked by 0010, now that real supervisors sign in with real routes.
--
-- DO NOT APPLY THIS UNTIL a real supervisor has signed in, seen their
-- real route, and submitted one real assessment. Until that is proven,
-- TEST ROUTE is the only working fallback for demonstrating the app.
--
-- What cascades, and therefore what this deletes without naming:
-- every FK to trainees is ON DELETE CASCADE (schema.ts) — assignments,
-- assessment_marks (and assessment_mark_items under them), results (and
-- result_revisions under those), notifications, and reassignments. The
-- verification marking done against TEST TRAINEE 1-5 on 2026-09-04 (all
-- three instruments, see MEMORY.md) therefore goes with them.
--
-- audit_log deliberately does NOT cascade — it holds no FK to trainees,
-- by design. The chain-hashed record of what was done to this test data
-- survives, which is correct: an audit log that can be erased by
-- deleting its subject is not an audit log.
--
-- Order matters. routes.supervisor_a1_id references users(id) with no
-- ON DELETE action, so the route must go before the user, and the
-- trainees before the route (trainees.route_id is ON DELETE RESTRICT).

-- 1. Trainees first — cascades through marks, items, results, assignments.
delete from trainees
where route_id in (select id from routes where code = 'TEST ROUTE');

-- 2. Then the route itself, which until now referenced the dev user.
delete from routes where code = 'TEST ROUTE';

-- 3. Then the application-side user row.
delete from users where email = 'test.supervisor@tathmini.internal';

-- 4. Finally the Auth identity. Without this the account can still
--    authenticate but has no users row, which leaves it bouncing between
--    /change-password and /login forever — no data access (RLS grants
--    nothing without a users row), but a confusing state to leave behind.
--
--    NOTE: this is the one statement here that touches the auth schema.
--    If your migration runner lacks the privilege, delete the user from
--    Supabase > Authentication > Users instead and drop this statement.
delete from auth.users where email = 'test.supervisor@tathmini.internal';
