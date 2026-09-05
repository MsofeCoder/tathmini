# HANDOFF — Saturday 2026-09-05, midday. Real use starts Monday.

Written for a fresh Claude Code agent picking this project up **on a
different Anthropic Pro account, same machine**, mid-sprint. This
replaces the 2026-09-04 handoff entirely — that one is absorbed into
`MEMORY.md` now.

Nothing here overrides `AGENTS.md`. Read the normal session-start order
(`AGENTS.md` → `CONTEXT.md` → `ROADMAP.md` → `MEMORY.md`, newest 3–4
entries). This file only says where to start and what not to re-derive.
**Disposable** — delete it once stale.

## Read this first: two things are true at once

1. **The app is built and works.** Auth, route list, trainee profile,
   all three marking instruments, the two-insert submit, gating, offline
   caching and an outbox — all live against the College's real Supabase
   project (`azlwxriyhdshfhklonrx`) and verified in a real browser.
2. **No real supervisor has ever signed in.** Every end-to-end
   verification so far used `test.supervisor` against `TEST ROUTE` and
   its five synthetic trainees (migration `0011`). The 30 real accounts,
   14 real routes and 482 real trainees are all in the database and have
   never been exercised through the UI.

Closing the gap between those two sentences is the whole job right now.

## The deadline

- **Monday 2026-09-07: real internal use begins**, both IPT and TP, by
  actual supervisors in the field.
- The user asked for this "before lunch" on Saturday 2026-09-05 and is
  switching accounts to keep working. Treat it as live.

Internal use only, for now. Full production polish (Swahili review,
PDF/e-mail/SMS, admin console, pentest, accessibility, rate limiting,
backups) is **deliberately deferred**, not forgotten — see `ROADMAP.md`
Phases 2–4.

## The critical path, in order

**1. The user runs `assign:passwords` against the live project.**
Blocking, and only they can do it — it needs the service-role key, which
an agent must never hold (`AGENTS.md`). If they have not done it yet,
say so plainly and give them the command; do not work around it.

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY = "<service_role secret>"
pnpm --filter @tathmini/db assign:passwords -- --template=passwords.xlsx
# fill in passwords, then:
pnpm --filter @tathmini/db assign:passwords -- --file=passwords.xlsx --dry-run
pnpm --filter @tathmini/db assign:passwords -- --file=passwords.xlsx
```

**2. A real supervisor signs in and submits one real assessment.**
The single highest-value unknown. Until it happens, RLS scoping against
real `assignments` rows, the real route list, and real trainee
particulars are all unproven. `denis.michael` (TP Route 6) or any IPT
supervisor will do.

**3. Apply migration `0013`** (written, NOT applied — see below).

**4. Browser-verify draft autosave and the outbox.** `ROADMAP.md` marks
both `[~] not yet browser-verified`. They are the entire offline promise:
a supervisor in a dead zone keeps typing, and reconnecting produces
exactly one submission, never two. Phase 1's exit gate depends on it.

## The password system — three scripts, do not confuse them

All in `packages/db/src/scripts/`, all documented in
`packages/db/README.md` with a comparison table. All need the
service-role key; **the user runs them, never you.**

|                  | `create:accounts`              | `assign:passwords`                          | `reset:passwords`            |
| ---------------- | ------------------------------ | ------------------------------------------- | ---------------------------- |
| For              | An account that does not exist | Handing out the College's chosen passwords  | "These leaked, rotate now"   |
| Existing account | **Skipped**                    | Updated                                     | Updated                      |
| Password         | Random                         | From the spreadsheet, or generated if blank | Random                       |
| Afterwards       | Must change on first sign-in   | **Permanent**                               | Must change on first sign-in |

**`assign:passwords` is the one the College actually uses.** It is the
Excel flow: `--template=<x.xlsx>` writes a workbook pre-filled with all
30 usernames, the admin types a password beside each person, `--file=`
applies them.

**The permanent-password decision was the user's, made explicitly on
2026-09-05, with the cost spelled out first.** Do not quietly re-litigate
it. The cost, recorded so nobody rediscovers it: the College holds a
spreadsheet of live credentials, and `assessment_marks` is attributable
to a named assessor, so "who awarded this mark" is now only as strong as
that file's privacy. Mitigations already built: 8-character minimum, and
two accounts sharing a password is a hard error.

Write order differs between the two password scripts **on purpose**, and
both orders are locked in by tests. In each, the order is chosen so a
partial failure never leaves a known-to-others password permanently
valid. Do not "tidy" them into agreement.

## Migration 0013 is written but NOT applied — deliberately

`packages/db/migrations/0013_remove_test_route_and_account.sql` removes
`TEST ROUTE`, its 5 trainees (cascading through their marks, items,
results and assignments) and the `test.supervisor` account.

**Do not apply it until step 2 above has passed.** Until a real
supervisor has signed in successfully, `TEST ROUTE` is the only working
way to demonstrate the app. `audit_log` deliberately does not cascade.

## What's already done — don't rebuild, don't re-derive

- **Schema, RLS, criteria, rosters.** 13 tables, RLS on every one,
  18/18 pgTAP live. All three instruments' criteria are seeded
  **verbatim** and arithmetic-verified. 30 accounts, 14 routes, 482
  trainees, 964 assignments imported. Migrations `0000`–`0012` applied.
- **The account list is fixed and correct** —
  `packages/db/src/data/{ipt,tp}-accounts.ts`. Adam Msofe and Aron
  Franco each hold two accounts (super_admin + `.supervisor`) by design.
  "Osward" is verbatim from the roster, not a typo to fix.
- **Marking works for all three instruments**, including the two-insert
  submit contract and server-side re-validation of gating.
- **Offline**: one online visit to the route list caches the whole route
  into IndexedDB; `/offline` re-renders the same `MarkingForm` from that
  cache and submits through the outbox.
- **PWA install**: manifest, icons, install gate, and the
  `middleware.ts` exclusion that makes them work (2026-09-05).

## Environment traps that have already cost time

- **Run `pnpm --filter` from the repo root.** From anywhere else it
  fails with the useless `No projects matched the filters`. The path
  contains spaces — quote it.
- **Nothing in this repo loads `.env` files except via
  `admin-client.ts`'s `resolveEnv()`.** There is no dotenv anywhere and
  `tsx` does not read env files on its own. `create-accounts.ts` is
  environment-only and predates the fix.
- **The service-role key is not on disk anywhere.** Root `.env` has
  `SUPABASE_URL` + `SUPABASE_ANON_KEY`; `.env.local` has only
  `VERCEL_OIDC_TOKEN`.
- **The git root is the `Header labels clip fix` directory**, not its
  parent. A tool that reports "not a git repository" has almost
  certainly resolved the parent path — check `git rev-parse
--show-toplevel` before repeating the claim. Working branch as of
  2026-09-05 is `phase-0/ipt-roster-support`; `.env.local` is
  gitignored and that ignore is enforced.
- **Another session may be editing concurrently.** On 2026-09-05 a
  second session added the PWA manifest/install gate while this one was
  working. Re-read before editing, and check the newest `MEMORY.md`
  entry is still the one you think it is.
- **An agent cannot type passwords into forms.** Browser-verifying a
  signed-in flow needs the user to sign in first, then hand the tab over.

## Non-negotiables — the deadline cuts polish, not these

- Authorisation is an RLS policy, never a React condition.
- `assessment_marks` is append-only.
- Scores, grade, GPA and verdict are computed in Postgres.
- An assessor reads only their own slot until both are submitted.
- Criterion wording is **verbatim** from `reference/forms/`.
- Stop and ask on migrations, RLS, auth, anything touching a stored mark.
- `pnpm lint && pnpm test && pnpm typecheck` green before reporting done.
- Append to `MEMORY.md` after every feature, decision or bug fix.
