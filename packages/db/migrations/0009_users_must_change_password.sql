-- Phase 1 auth: forced password change on first use.
--
-- Adds users.must_change_password (default true — every account so far,
-- including all 30 real ones already live, was admin-provisioned with a
-- generated one-time password; none of them have set their own yet).
-- ALTER TABLE ... ADD COLUMN ... DEFAULT backfills existing rows to the
-- default (a non-volatile default needs no table rewrite on PG 11+), so
-- this correctly marks every existing account too, not just future ones.
--
-- clear_own_password_change_flag(): a SECURITY DEFINER RPC, same pattern
-- as current_app_role()/is_coordinator()/etc. in
-- 0001_rls_and_functions.sql. Needed because the existing users RLS
-- (users_select / users_admin_write, both from 0001) gives a regular
-- user no UPDATE grant on their own row at all — only super_admin can
-- write to users directly. Rather than route this through a service-role
-- call from a server action, a narrowly-scoped function keeps
-- authorisation in Postgres (AGENTS.md rule 1): it can only ever clear
-- the caller's own flag (auth.uid()), nothing else about the row.

alter table users
  add column if not exists must_change_password boolean not null default true;

create or replace function clear_own_password_change_flag()
returns void
language sql
security definer
set search_path = public
as $$
  update users set must_change_password = false where id = auth.uid();
$$;
