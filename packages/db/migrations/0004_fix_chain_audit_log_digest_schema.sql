-- Fixes chain_audit_log()'s unqualified digest(...) call, found the hard
-- way applying 0001_rls_and_functions.sql to a real Supabase project for
-- the first time (see MEMORY.md).
--
-- On Supabase, pgcrypto's functions live in the `extensions` schema, not
-- `public` — confirmed live: digest()/gen_random_uuid() both resolve to
-- `extensions`. The database-level search_path is `"$user", public,
-- extensions`, which would normally find digest() unqualified — but
-- chain_audit_log() only ever runs nested inside log_audit(), which is
-- `SECURITY DEFINER SET search_path = public`. That SET pins the
-- search_path to `public` alone for the whole nested call, so
-- `extensions` is out of scope at the point digest() is actually called,
-- and it fails with "function digest(text, unknown) does not exist".
--
-- Locally this never surfaced because the throwaway Postgres 16 container
-- installs pgcrypto straight into `public` (no dedicated extensions
-- schema convention there), so the unqualified call resolved by accident.
--
-- Fix: give chain_audit_log() its own `set search_path` covering both
-- locations, same pattern the other Phase 0 functions already use. A
-- nonexistent schema in search_path is not an error in Postgres — it's
-- just skipped during lookup — so `public, extensions` resolves digest()
-- correctly in both the local container (public) and Supabase
-- (extensions) without hardcoding either one, unlike a hardcoded
-- `extensions.digest(...)` call, which would work on Supabase but break
-- local verification (no `extensions` schema exists there at all).

create or replace function chain_audit_log()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
declare
  v_prev_hash text;
begin
  select hash into v_prev_hash from audit_log order by created_at desc, id desc limit 1;
  new.prev_hash := v_prev_hash;
  new.hash := encode(
    digest(
      coalesce(v_prev_hash, '') || coalesce(new.actor_id::text, '') || new.action
        || new.target_table || coalesce(new.target_id::text, '') || coalesce(new.detail, '')
        || now()::text,
      'sha256'
    ),
    'hex'
  );
  return new;
end;
$$;