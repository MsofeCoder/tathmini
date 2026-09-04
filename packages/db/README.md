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
