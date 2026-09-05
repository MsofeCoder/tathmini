-- Groups stored reports by route, so the bucket matches how the College
-- works: a supervisor owns a route, and the Coordinator reviews by route.
--
--   before   <trainee_id>/<year>/<file>.pdf
--   after    <ROUTE>/<trainee_id>/<year>/<file>.pdf
--
-- 0014's Storage policies read the trainee id from the FIRST path segment,
-- `(storage.foldername(name))[1]::uuid`. With the route in front, the trainee
-- id is now the second segment, so those policies have to move with it.
--
-- Two hazards this migration exists to avoid, neither of which is obvious:
--
-- 1. Objects already stored under the old layout. Their second segment is the
--    year, and `'2026'::uuid` does not deny access — it RAISES. A cast error
--    inside a policy surfaces as a failed query, so one stale object could
--    break listing for everyone. The helper below therefore reads the second
--    segment, falls back to the first, and returns NULL rather than throwing.
--    Old and new layouts both keep working, and nothing is orphaned.
--
-- 2. NULL must deny. is_assigned_to_trainee(NULL) is not true, so a path that
--    matches neither shape grants nothing.
--
-- This does NOT widen access. The object is still readable only by the
-- coordinator, a super_admin, or a supervisor assigned to that trainee —
-- exactly as in 0014. Only WHERE the trainee id is read from has changed.

create or replace function public.report_path_trainee_id(object_name text)
returns uuid
language plpgsql
immutable
as $$
declare
  parts text[] := storage.foldername(object_name);
  candidate text;
begin
  -- New layout: <ROUTE>/<trainee_id>/<year>/... ; old: <trainee_id>/<year>/...
  foreach candidate in array array[parts[2], parts[1]] loop
    if candidate is not null then
      begin
        return candidate::uuid;
      exception when invalid_text_representation then
        -- not a uuid; try the next position
      end;
    end if;
  end loop;
  return null;
end;
$$;

drop policy if exists reports_bucket_select on storage.objects;
drop policy if exists reports_bucket_insert on storage.objects;

create policy reports_bucket_select on storage.objects for select to authenticated
  using (
    bucket_id = 'reports'
    and (
      is_coordinator()
      or is_super_admin()
      or is_assigned_to_trainee(public.report_path_trainee_id(name))
    )
  );

create policy reports_bucket_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'reports'
    and (
      is_coordinator()
      or is_super_admin()
      or is_assigned_to_trainee(public.report_path_trainee_id(name))
    )
  );
