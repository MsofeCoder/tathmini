-- Adds a place to record a supervisor's REAL e-mail address.
--
-- users.email cannot hold it. That column is the sign-in identifier — it
-- mirrors auth.users.email, which is what a supervisor types to sign in — and
-- every account deliberately uses a synthetic <firstname>.<lastname>@
-- tathmini.internal address that nothing is ever sent to (CONTEXT.md; it is
-- also why "Forgot password?" is not a link). Overwriting it with a real
-- address would change how somebody signs in and, if auth.users disagreed for
-- even a moment, would lock them out.
--
-- So this is a separate, nullable column: contactable, never authenticating.
--
-- Nullable and unconstrained on purpose. Most of the 30 accounts have no real
-- address on file, and a NOT NULL or UNIQUE constraint here would either block
-- the import of accounts that legitimately have none, or reject two people who
-- share a family address — neither is this column's business. It is a note,
-- not an identity.
--
-- No RLS change: users_select (migration 0001) already scopes who can read a
-- users row at all, and a new column on that table inherits it. Nothing here
-- widens what anyone can see.

alter table users add column if not exists contact_email text;

comment on column users.contact_email is
  'Real, reachable e-mail address. NOT used for sign-in — users.email is the '
  'synthetic @tathmini.internal identifier that authenticates. Nullable: most '
  'accounts have none on file.';
