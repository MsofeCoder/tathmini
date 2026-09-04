-- Minimal stand-in for Supabase's `auth` schema — local dev and CI only.
-- Supabase itself provides the real auth.users / auth.uid() in every
-- actual environment; nothing here ever runs against a real project.
--
-- Verified against a live Postgres 16 container during the Phase 0
-- schema/RLS session — see MEMORY.md.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid()
);

-- Mirrors auth.uid(): reads the JWT "sub" claim for the current session,
-- set with: select set_config('request.jwt.claim.sub', '<uuid>', false);
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
end
$$;

grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
alter default privileges in schema public grant all on tables to authenticated;
