-- Lets a Super Administrator remove the test rows from the console, and remove
-- the report files that belong to them.
--
-- NOT APPLIED. Review this, then apply it in the SQL editor. Until it is
-- applied the button in the console reports that it is not enabled and does
-- nothing — it does not fail halfway.
--
-- WHY A FUNCTION AND NOT A DELETE
--
-- `delete on trainees` is revoked from `authenticated` in
-- 0001_rls_and_functions.sql, deliberately: deleting a trainee cascades to that
-- trainee's marks, and marks are the append-only record this whole system
-- exists to protect. That revocation stays. This adds one narrow, named
-- exception that can only ever remove rows matching the test-data predicate —
-- a Super Administrator still cannot delete a real trainee through it, which is
-- the property that makes the button safe to put on a screen.
--
-- The predicate is the same one the application uses
-- (apps/web/src/lib/admin/test-data.ts) and covers all four shapes: TEST-TP-
-- and TEST-IPT- registration numbers, anything on the route coded 'TEST ROUTE',
-- and the two rows from migration 0011 whose registration_number is NULL —
-- `null ~ '^TEST-'` is null rather than false, so a regex alone misses them.
--
-- WHAT IT DELETES, and what that cascades to:
--   trainees                     the test rows themselves
--     → assessment_marks         ON DELETE CASCADE (about 13 test marks)
--       → assessment_mark_items  ON DELETE CASCADE
--     → results                  ON DELETE CASCADE
--     → reports                  ON DELETE CASCADE (rows only, see below)
--     → assignments              ON DELETE CASCADE
--
-- The PDF FILES in Storage are not touched by any of that — a cascade deletes
-- rows, not objects — so the second half of this migration adds a DELETE policy
-- on the reports bucket, scoped to Super Administrators, and the application
-- removes those files itself before calling this function.

-- ══════════════════════════════════════════════════════════════════════
-- Run this first, on its own, and read it
-- ══════════════════════════════════════════════════════════════════════
--
--   select t.registration_number, t.name, r.code as route,
--          (select count(*) from assessment_marks m where m.trainee_id = t.id) as marks
--   from trainees t
--   left join routes r on r.id = t.route_id
--   where t.registration_number ~ '^TEST-(TP|IPT)-'
--      or r.code = 'TEST ROUTE'
--   order by r.code, t.name;
--
-- Expect 46 rows, every name obviously a test row. If a real trainee appears in
-- that list, STOP: it means a real person has been placed on the test route,
-- and this function would delete them along with their marks.

create or replace function purge_test_trainees()
returns table (trainees_deleted integer, marks_deleted integer, reports_deleted integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_trainees integer := 0;
  v_marks integer := 0;
  v_reports integer := 0;
begin
  -- SECURITY DEFINER runs as the owner and bypasses RLS, so the role check is
  -- this function's own responsibility and comes before anything else.
  if not is_super_admin() then
    raise exception 'Only a Super Administrator may remove test data'
      using errcode = 'insufficient_privilege';
  end if;

  select array_agg(t.id)
    into v_ids
  from trainees t
  left join routes r on r.id = t.route_id
  where t.registration_number ~ '^TEST-(TP|IPT)-'
     or r.code = 'TEST ROUTE';

  if v_ids is null then
    trainees_deleted := 0;
    marks_deleted := 0;
    reports_deleted := 0;
    return next;
    return;
  end if;

  -- Counted before the delete, because afterwards there is nothing to count.
  select count(*) into v_marks from assessment_marks where trainee_id = any(v_ids);
  select count(*) into v_reports from reports where trainee_id = any(v_ids);

  delete from trainees where id = any(v_ids);
  get diagnostics v_trainees = row_count;

  -- The per-row trigger on `trainees` already writes one audit entry per
  -- deleted row. This adds the summary a human reads: one line saying a purge
  -- happened, who ran it, and how much it took with it.
  insert into audit_log (actor_id, action, target_table, target_id, detail)
  values (
    auth.uid(),
    'PURGE_TEST_DATA',
    'trainees',
    null,
    format('%s test trainees, %s marks, %s report rows', v_trainees, v_marks, v_reports)
  );

  trainees_deleted := v_trainees;
  marks_deleted := v_marks;
  reports_deleted := v_reports;
  return next;
end;
$$;

comment on function purge_test_trainees() is
  'Removes rows matching the documented test-data predicate. Super Administrator only; cannot touch a real trainee.';

revoke all on function purge_test_trainees() from public;
grant execute on function purge_test_trainees() to authenticated;

-- ══════════════════════════════════════════════════════════════════════
-- Report files: the one delete path the reports bucket has
-- ══════════════════════════════════════════════════════════════════════
--
-- The bucket has carried only INSERT and SELECT policies since 0014. Without a
-- DELETE policy, purging test trainees would leave their PDFs in storage
-- forever, unreferenced and unreachable. Scoped to Super Administrators, and to
-- this bucket alone.

create policy reports_bucket_delete on storage.objects for delete to authenticated
  using (bucket_id = 'reports' and public.is_super_admin());

-- ══════════════════════════════════════════════════════════════════════
-- Prove it worked
-- ══════════════════════════════════════════════════════════════════════
--
--   select count(*) from trainees t
--   left join routes r on r.id = t.route_id
--   where t.registration_number ~ '^TEST-(TP|IPT)-' or r.code = 'TEST ROUTE';
--   -- expect 0
--
--   select count(*) from trainees;   -- expect 500 (546 less the 46 test rows)
--
--   select actor_id, action, detail, created_at from audit_log
--   where action = 'PURGE_TEST_DATA' order by created_at desc limit 1;
