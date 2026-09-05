# @tathmini/db

Drizzle schema, RLS/functions migrations, seed data, and the pgTAP suite.
The College's real Supabase project is now connected (`azlwxriyhdshfhklonrx`;
migrations `0000`–`0004` applied 2026-09-04, see `MEMORY.md`). Every schema
change is still proven against a local Postgres first, exactly as below,
before it goes anywhere near the real project — this file documents that
workflow so it's reproducible without re-deriving it.

## Layout

```
src/schema.ts              Drizzle table definitions (source of truth for DDL)
migrations/0000_*.sql      Generated from schema.ts — table DDL only
migrations/0001_*.sql      Hand-written — RLS policies, functions, triggers
scripts/local-auth-stub.sql  Minimal stand-in for Supabase's `auth` schema
pgtap/phase0.sql           The Phase 0 exit-gate suite (PLAN.md 0.2 / 0.3)
src/seed/criteria.ts       Verbatim VETA criteria (TP Theory, IPT — not TP Practical, see MEMORY.md)
src/scripts/import-trainees.ts  Parses/validates the College's roster spreadsheet
```

## Running the migrations locally (no Supabase project needed)

Every guarantee in `migrations/0001_rls_and_functions.sql` depends on
`auth.uid()` reading a JWT claim the way Supabase's Postgres does. The
stub in `scripts/local-auth-stub.sql` reproduces just enough of that for
local testing — it is never used against a real project.

These commands use `docker exec ... psql` rather than a host-installed
`psql` client, so they work even if you don't have one on `PATH` (copy
the SQL files into the container first, since the container is the only
place `psql` is guaranteed to exist).

> On Windows Git Bash/MSYS, a standalone argument that looks like a Unix
> absolute path (`/tmp/...`) gets silently rewritten to a Windows path
> before reaching `docker`. This breaks `docker exec ... -f /tmp/x`
> (the whole argument is `/tmp/x`) but not `docker cp`'s `container:/tmp/x`
> destination (the argument doesn't start with `/`, so MSYS leaves it
> alone). The commands below use `//tmp/...` only where `docker exec`
> needs it — harmless and unnecessary, but also harmless, on Linux/macOS.

```bash
# 1. A throwaway Postgres 16 — use a port that won't collide with
#    anything else you have running.
docker run -d --name tathmini-db -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=tathmini -p 55432:5432 postgres:16-alpine

# 2. Copy in and apply the auth stub, then both migrations, in order.
docker cp scripts/local-auth-stub.sql tathmini-db:/tmp/local-auth-stub.sql
docker exec tathmini-db psql -U postgres -d tathmini -v ON_ERROR_STOP=1 -f //tmp/local-auth-stub.sql
for f in migrations/*.sql; do
  docker cp "$f" tathmini-db:/tmp/"$(basename "$f")"
  docker exec tathmini-db psql -U postgres -d tathmini -v ON_ERROR_STOP=1 -f //tmp/"$(basename "$f")"
done

# 3. Tear down when done.
docker rm -f tathmini-db
```

## Running the pgTAP suite locally

Needs the real `pgtap` extension, which the alpine Postgres image above
doesn't include. Use the Debian-based image and install it, matching what
CI does (`.github/workflows/ci.yml`'s `pgtap` job):

```bash
docker run -d --name tathmini-db-pgtap -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=tathmini -p 55432:5432 postgres:16
docker exec tathmini-db-pgtap sh -c "apt-get update && apt-get install -y postgresql-16-pgtap"

docker cp scripts/local-auth-stub.sql tathmini-db-pgtap:/tmp/local-auth-stub.sql
docker exec tathmini-db-pgtap psql -U postgres -d tathmini -v ON_ERROR_STOP=1 -f //tmp/local-auth-stub.sql
for f in migrations/*.sql; do
  docker cp "$f" tathmini-db-pgtap:/tmp/"$(basename "$f")"
  docker exec tathmini-db-pgtap psql -U postgres -d tathmini -v ON_ERROR_STOP=1 -f //tmp/"$(basename "$f")"
done
docker exec tathmini-db-pgtap psql -U postgres -d tathmini -v ON_ERROR_STOP=1 -c "create extension if not exists pgtap;"

docker cp pgtap/phase0.sql tathmini-db-pgtap:/tmp/phase0.sql
docker exec tathmini-db-pgtap psql -U postgres -d tathmini -f //tmp/phase0.sql

docker rm -f tathmini-db-pgtap
```

**Read the output, don't just check the exit code.** `psql` exits 0
regardless of how many pgTAP assertions failed — only the printed `ok`/
`not ok` lines and the final tally are the truth. CI pipes the output
through `grep -q '^not ok'` for exactly this reason; do the same locally,
or eyeball the `1..N` / `ok N - ...` lines yourself. See `MEMORY.md`'s
"pgTAP suite's throws_ok calls were checking the wrong thing" entry for
how this bit us once already.

## Changing the schema

1. Edit `src/schema.ts`.
2. `pnpm --filter @tathmini/db exec drizzle-kit generate` — writes a new
   numbered migration under `migrations/`.
3. Anything not expressible in `schema.ts` (RLS, functions, triggers) goes
   in a hand-written migration: `pnpm --filter @tathmini/db exec
drizzle-kit generate --custom --name=<name>` creates an empty numbered
   slot to fill in.
4. Verify against a local Postgres per the workflow above before opening
   a PR — per `AGENTS.md`, migrations get shown and reviewed, never
   applied on the strength of "it typechecked."

## Importing the trainee roster

```bash
TRAINEE_REGISTER_PATH=/path/to/local/copy.xlsx pnpm --filter @tathmini/db import:trainees
```

The spreadsheet is never committed — see the root `.gitignore`'s
`packages/db/data/` entry, a convenient (gitignored) place to keep a
local copy. The script currently only parses and validates (duplicate
registration numbers, duplicate emails, missing fields); it does not yet
write to a database, since none is connected.

## Accounts: creating, assigning and rotating passwords

Two scripts, deliberately separate. Both need `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`. **That key bypasses RLS entirely — run these
yourself, never hand the key to an agent** (`AGENTS.md`).

**Run them from the repo root**, not from your home directory —
`pnpm --filter` only resolves inside the workspace, and outside it fails
with the unhelpful `No projects matched the filters`.

`reset:passwords` reads, in increasing order of precedence: repo-root
`.env`, repo-root `.env.local`, `packages/db/.env.local`, and finally
anything already set in your shell — **a shell value always wins over a
file**. All four are optional; only the two variables ending up set
matters. Note that `create:accounts` predates this and reads the
environment only, so it still needs the vars set inline.

The service-role key is under Supabase > Project Settings > API, as
"service_role" / "secret". It is NOT the anon key. Either put it in the
gitignored repo-root `.env.local`:

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<the service_role secret>
```

...or set it inline for a single run, which keeps it off disk entirely:

```powershell
# PowerShell
$env:SUPABASE_SERVICE_ROLE_KEY = "<the service_role secret>"
pnpm --filter @tathmini/db reset:passwords -- --dry-run
Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY   # clear it again
```

```bash
# Create any account in ipt-accounts.ts / tp-accounts.ts / dev-accounts.ts
# that does not exist yet. Existing accounts are SKIPPED, never touched.
pnpm --filter @tathmini/db create:accounts

# Rotate the password on accounts that DO exist, and re-arm the
# forced-password-change flag on each.
pnpm --filter @tathmini/db reset:passwords -- --dry-run          # resolve + report, no writes
pnpm --filter @tathmini/db reset:passwords                        # all 30 real accounts
pnpm --filter @tathmini/db reset:passwords -- --only=msofe.coder,aron.franco
```

### Assigning the admin's own passwords, in bulk (`assign:passwords`)

The flow the College uses in practice. A password assigned this way is
**permanent** — it clears `must_change_password`, so the supervisor is
not forced to change it and the College can re-tell them what it is.

```bash
# 1. Starter workbook, pre-filled with all 30 usernames.
pnpm --filter @tathmini/db assign:passwords -- --template=passwords.xlsx

# 2. Open it, type a password beside each person, save.

# 3. Check it — validates the whole sheet, writes nothing.
pnpm --filter @tathmini/db assign:passwords -- --file=passwords.xlsx --dry-run

# 4. Apply.
pnpm --filter @tathmini/db assign:passwords -- --file=passwords.xlsx
```

Columns are found by header name (`Username`, `Password`), not position,
so reordering or inserting columns is safe. Any problem aborts the whole
run before a single write — a half-applied sheet is the worst state to
debug, because the spreadsheet no longer tells you who is on which
password. The checks:

| Problem                         | Why it is fatal                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Username is not a real account  | A typo would otherwise silently set nobody's password                                                        |
| Same username twice             | Ambiguous — which password wins?                                                                             |
| Password under 8 characters     | Matches the in-app `/change-password` minimum                                                                |
| Two accounts sharing a password | Either person could have submitted the other's marks; `assessment_marks` is attributable to a named assessor |

A **blank** Password cell is not an error — that person gets a generated
memorable password like `simba-moto-4821` (two Swahili words + four
digits, ~2^28 keyspace). That is deliberately weaker than
`create-accounts.ts`'s 16-character random string, and it is the right
trade for a password that is now typed at _every_ sign-in rather than
once: a credential nobody can type gets written on paper and shared,
which is worse. An admin who wants more entropy types their own into the
sheet.

**The spreadsheet becomes a list of live credentials.** Keep it off
shared drives, out of e-mail, and off any machine the supervisors
themselves use.

### Which script to use

|                  | `create:accounts`              | `assign:passwords`                          | `reset:passwords`               |
| ---------------- | ------------------------------ | ------------------------------------------- | ------------------------------- |
| For              | An account that does not exist | Handing out the College's chosen passwords  | "These leaked, rotate them now" |
| Existing account | **Skipped**                    | Updated                                     | Updated                         |
| Password         | Random, generated              | From the spreadsheet, or generated if blank | Random, generated               |
| Afterwards       | Must change on first sign-in   | **Permanent**                               | Must change on first sign-in    |
| Env vars         | Shell only                     | Files or shell                              | Files or shell                  |

`create:accounts` is create-only — it cannot rotate a password, because
it skips anything already registered. `reset:passwords` is the other
half, and covers `REAL_ACCOUNTS` (the 13 IPT-round + 17 TP-round
accounts) only: `test.supervisor` is excluded on purpose, since that
account and its `TEST ROUTE` data are for deletion, not rotation.

Both print a one-time username/password table to **stdout only** — never
to a file, never anywhere else. Hand them out through a secure channel
and discard. `reset:passwords` sets `must_change_password = true` on
every account it touches, so what you hand out is a one-time credential:
the holder is sent to `/change-password` on first sign-in before they can
reach anything else.

**Order of writes matters, and is tested.** The flag is set _before_ the
password. If the password write then fails, the account is left reachable
only by its old password _and_ forced to change it — safe, and fixed by
re-running. The reverse order would risk a handed-out password its holder
is never forced to change.

**Known limitation:** rotating a password does not explicitly revoke a
session already established with the old one. Nobody has signed in with
the real accounts yet, so this does not matter today — but if it ever
does, revoking the outstanding refresh tokens is a separate step this
script does not perform.
