# HANDOFF — Saturday 2026-09-05, afternoon. Real use starts Monday.

For a fresh Claude Code agent picking this up **on a different Anthropic
Pro account, same machine**. Replaces every earlier handoff.

Read the normal session-start order first (`AGENTS.md` → `CONTEXT.md` →
`ROADMAP.md` → `MEMORY.md`, newest 3–4 entries). This file says only
where to start and what not to re-derive. **Disposable** — delete it once
stale.

**Another session is working in this repo right now** (Phase 2 PDF
reports). See "Concurrent session" below before touching anything.
Re-read files before editing; do not commit their work.

---

## The one thing that matters most

**Nothing from today is deployed, and the live app has a visible bug that
is already fixed in this branch.**

- `tathmini-web.vercel.app` serves **`main`** (`origin/HEAD → origin/main`).
- This branch, `phase-0/ipt-roster-support`, is **20 commits unpushed**
  and **9 commits ahead of `main`**.
- One of them, `61abe0c`, fixes the route-list counters. On the deployed
  build a supervisor who has finished a trainee still sees **0% / 0
  ASSESSED / all NOT STARTED**, while the per-row badges correctly read
  "1 of 2 assessors". Confirmed against the live site today.

**On Monday every supervisor's progress reads 0% regardless of work
done.** The fix exists. It is not deployed.

**Action, and it is the user's call:** push the branch, open a PR into
`main`, merge, let Vercel redeploy, re-check the counters live. Do not
push or merge unless asked.

---

## Where things stand

### Verified live today (2026-09-05)

- **All 30 real passwords are assigned and working.** The user ran
  `assign:passwords` against `azlwxriyhdshfhklonrx`. Passwords are
  **permanent** — see the decision below.
- **A real supervisor signed in for the first time ever** —
  `denis.michael`, TP ROUTE 6. Checked in a real browser:
  - RLS scoping: 43 trainees, not all 482
  - Route list: 43 rows, real names / trades / centres
  - Trainee profile: real registration number, e-mail, region, district
  - Assessor slot resolves from real `assignments` ("Assessor 1 of 2")
  - Marking form: all 41 TP Theory criteria, 0.5 steps, subtotals
  - Offline cache: whole route written to IndexedDB
- **Draft autosave — `ROADMAP.md` line moved to `[x]`.** Scoring one
  criterion wrote a `drafts` row keyed `<traineeId>:<instrumentId>`; a
  full reload restored the score, the section subtotal and the pressed
  button. The injected score was cleared; nothing reached the database.

### The next task, and it is small

**Browser-verify the outbox.** Last `[~]` on Phase 1 and its exit gate:
go offline, submit, confirm it queues; reconnect, confirm it drains to
**exactly one** row, never two.

Run it as `test.supervisor` on `TEST ROUTE` — never a real trainee. The
user was signed in as `test.supervisor` when this was written.

### Then, and only then

Apply `packages/db/migrations/0013_remove_test_route_and_account.sql`.
Written, committed, **deliberately not applied**. It deletes `TEST
ROUTE`, its 5 trainees and `test.supervisor` — the only safe place to
exercise the submit path. Not before the outbox test.

---

## Hard rule: never submit a mark against a real trainee

`assessment_marks` is append-only — no role has an `UPDATE` grant. A
"just testing" submission against a real trainee is **permanent**; the
only way to supersede one is `result_revisions`, which is Phase 3 and
unbuilt. It would sit in the College's records forever.

Read-only checks against real data are fine. Draft autosave is fine — it
is pure IndexedDB and never touches the database. **Submitting is not.**

---

## The password system — three scripts, do not confuse them

In `packages/db/src/scripts/`, documented in `packages/db/README.md`.
All need the service-role key. **The user runs them, never you**
(`AGENTS.md`).

|                  | `create:accounts`      | `assign:passwords`                 | `reset:passwords` |
| ---------------- | ---------------------- | ---------------------------------- | ----------------- |
| For              | Account does not exist | The College's chosen passwords     | "These leaked"    |
| Existing account | **Skipped**            | Updated                            | Updated           |
| Password         | Random                 | From the sheet, generated if blank | Random            |
| Afterwards       | Must change            | **Permanent**                      | Must change       |

`assign:passwords` is the one in use: `--template=<x.xlsx>` writes a
workbook pre-filled with all 30 usernames, the admin types a password
beside each person, `--file=` applies it. Any problem aborts the whole
run before a single write.

**The permanent-password decision was the user's**, made explicitly on
2026-09-05 with the cost spelled out first. Do not re-litigate it. The
cost, recorded so nobody rediscovers it: the College holds a spreadsheet
of live credentials, and `assessment_marks` is attributable to a named
assessor, so "who awarded this mark" is only as strong as that file's
privacy. Mitigations built in: 8-character minimum, and two accounts
sharing a password is a hard error.

**Write order differs between the two password scripts on purpose**, and
both orders are locked in by tests. In each, the order is chosen so a
partial failure never leaves a known-to-others password permanently
valid. Do not "tidy" them into agreement.

**`packages/db/passwords.xlsx` holds 30 live permanent credentials.**
Spreadsheets are gitignored repo-wide (`202f2a9`) and none has ever been
tracked, so history is clean. Never `git add -f` one.

---

## Concurrent session — Phase 2 PDF reports, in flight

A second session is building reports/PDF **right now**. Uncommitted and
**not yours to commit**:

```
 M apps/web/package.json
 M apps/web/src/app/trainee/[id]/page.tsx
 M packages/db/src/schema.ts
 M packages/db/migrations/meta/_journal.json
 M pnpm-lock.yaml
?? apps/web/src/app/trainee/[id]/actions.ts
?? apps/web/src/app/trainee/[id]/report-download-button.tsx
?? apps/web/src/lib/reports/
?? packages/db/migrations/0014_add_reports_table.sql
?? packages/db/migrations/meta/0014_snapshot.json
```

Two traps in that work — flag them to whoever owns it:

1. **It first generated a migration numbered `0012`**, colliding with the
   existing `0012_fix_finalize_mark_security_definer.sql`. It renumbered
   to `0014` itself — verify before anything is applied.
2. **Its generated SQL re-adds `must_change_password`**, which migration
   `0009` already added and which is **live in production**. Applying it
   as-is fails on a duplicate column. Drizzle regenerates it because
   `0009` was hand-written and never captured in a snapshot. The same
   trap recurs for every hand-written migration.

---

## Environment traps that have already cost hours

- **Run `pnpm --filter` from the repo root.** Anywhere else gives the
  useless `No projects matched the filters`. The path has spaces — quote
  it.
- **Only `admin-client.ts`'s `resolveEnv()` loads `.env` files.** There
  is no dotenv here and `tsx` does not read them. Precedence: root
  `.env` < root `.env.local` < `packages/db/.env.local` < **shell always
  wins**.
- **The service-role key lives in the gitignored root `.env.local`.**
  Root `.env` has only `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
- **The git root is the `Header labels clip fix` directory**, not its
  parent. A tool reporting "not a git repository" has resolved the
  parent path — run `git rev-parse --show-toplevel` before repeating the
  claim. An earlier handoff got this wrong.
- **`pnpm format:check` fails locally on Windows and is a false alarm.**
  `core.autocrlf=true` with no `.gitattributes`, so git checks out CRLF
  while prettier wants LF. **CI on Linux is unaffected.** The proper fix
  (`* text=auto eol=lf`) renormalises the whole repo — a large diff that
  would collide with the concurrent session, deliberately deferred until
  after Monday. Check single files with `npx prettier --check <path>`
  instead of trusting the repo-wide run.
- **An agent cannot type passwords into forms.** Browser-verifying a
  signed-in flow needs the user to sign in and hand the tab over. Ask; do
  not work around it.
- **Commit subjects must be lowercase** (commitlint `subject-case`).
  `feat(web): PWA manifest…` is rejected; `feat(web): add the manifest…`
  passes.

---

## Already done — do not rebuild or re-derive

- **Schema, RLS, criteria, rosters.** 13 tables, RLS everywhere, 18/18
  pgTAP live. All three instruments seeded **verbatim** and
  arithmetic-verified. 30 accounts, 14 routes, 482 trainees, 964
  assignments. Migrations `0000`–`0012` applied live; `0013` written, not
  applied.
- **The account list is fixed and correct** —
  `packages/db/src/data/{ipt,tp}-accounts.ts`. Adam Msofe and Aron Franco
  each hold two accounts (super_admin + `.supervisor`) by design.
  "Osward" is verbatim from the roster, not a typo to fix.
- **Marking works for all three instruments**, including the two-insert
  submit contract and server-side re-validation of gating.
- **Offline**: one online visit caches the whole route to IndexedDB;
  `/offline` re-renders the same `MarkingForm` from that cache and
  submits through the outbox.
- **PWA**: manifest, icons, real MVTTC crest, install screen, and the
  `middleware.ts` exclusion that makes them work.
- **`Forgot password?` is intentionally not a link** (`0813d6c`). No
  reset flow exists or can: every account e-mail is a synthetic
  `@tathmini.internal` identifier nothing is sent to. It tells the user
  to contact the Administrator. Do not "restore" the link.

---

## Deferred deliberately — say so, do not half-build

Admin console (Phase 3, including the in-app version of password
assignment), Swahili review, e-mail/SMS, pentest, accessibility audit,
rate limiting, backup panel. Building the in-app password screen means
putting the **service-role key into Vercel's environment** — the web app
holds only the anon key today. A real decision to make deliberately, not
a detail to slip into a PR.

---

## Non-negotiables — the deadline cuts polish, not these

- Authorisation is an RLS policy, never a React condition.
- `assessment_marks` is append-only.
- Scores, grade, GPA and verdict are computed in Postgres.
- An assessor reads only their own slot until both are submitted.
- Criterion wording is **verbatim** from `reference/forms/`.
- Stop and ask on migrations, RLS, auth, anything touching a stored mark.
- `pnpm lint && pnpm test && pnpm typecheck` green before reporting done.
- Append to `MEMORY.md` after every feature, decision or bug fix.
