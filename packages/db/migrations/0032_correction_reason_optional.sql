-- 0032 — "How do you know?" is no longer asked for on a correction request.
--
-- The supervisor names which particular is wrong and what it should say. That
-- is the whole request; the Administrator decides against the register itself
-- and does not need a sentence of justification typed one-handed in a workshop.
-- The field was the only thing standing between a supervisor and reporting a
-- wrong e-mail address, so it went.
--
-- Two things have to go together, or the insert still fails:
--   * the NOT NULL, so the column can be omitted;
--   * the CHECK, which rejects an empty string — a null passes a CHECK, but
--     leaving it would trap anyone who later writes '' instead of null.
--
-- Nothing is dropped and no row is rewritten: requests raised before this keep
-- their reason and the admin console still displays it (it renders the line
-- only when a reason is present).

alter table trainee_change_requests
  drop constraint if exists trainee_change_requests_reason_check;

alter table trainee_change_requests
  alter column reason drop not null;
