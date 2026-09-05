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

-- `email` is added separately rather than inlined above, so that a local
-- database created from an older copy of this stub gains the column too
-- (`create table if not exists` would silently skip it).
--
-- The account-linking migrations (0007, 0008, 0010) all key on it —
-- `join auth.users au on au.email = v.email` — and 0013 deletes by it.
-- Without the column those migrations fail outright with "column au.email
-- does not exist", which is exactly what happened: the pgTAP job went red
-- the moment 0007 landed and stayed red, so the suite AGENTS.md calls the
-- priority one silently stopped running. See MEMORY.md.
--
-- In CI this table is always empty, so those joins match nothing and each
-- import migration is a clean no-op — every one is NOT EXISTS-guarded and
-- the routes/trainees that hang off them join through `users`. pgTAP seeds
-- its own fixtures and does not depend on any of that roster data.
--
-- Unique because Supabase's real auth.users enforces it, and a duplicate
-- here would silently fan out those joins into multiple `users` rows.
alter table auth.users add column if not exists email text;
create unique index if not exists auth_users_email_key on auth.users (email);

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
