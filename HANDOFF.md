# HANDOFF — Saturday 2026-09-05, evening. Real use starts Monday 2026-09-07.

Replaces every earlier handoff. **Disposable** — rewrite or delete it the
moment it stops being true. The previous one was left in place after it went
stale and actively misled a later session into re-deriving work that had
already shipped, which is why this file says less and dates everything.

Read the normal order first: `AGENTS.md` → `CONTEXT.md` → `ROADMAP.md` →
`MEMORY.md` (newest 4). This says only what those cannot.

---

## Do not trust a summary of state, including this one

Verify it. The state moved several times an hour on 2026-09-05:

```
git fetch origin && git log --oneline origin/main -1
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

**Two sessions have been working in this repo at once, on different Anthropic
accounts.** Assume the working tree contains somebody else's uncommitted work.
Stage files by name, never `git add -A`, and re-read a file before editing it.

If you need a clean base and the checkout sits on somebody else's branch, use a
worktree rather than switching theirs:

```
git worktree add --detach /tmp/wt origin/main
```

pnpm's store symlinks do not survive a Windows junction into a worktree.
`vitest`, `eslint` and `tsc` work if you junction all four `node_modules`
(root plus the three workspaces), but `next build` still resolves Next's client
entry to a mangled cross-drive path and fails. Let CI and Vercel's preview
build be the authority for the build.

---

## The two things that actually matter before Monday

### 1. The outbox has never been proven in a browser

Phase 1's exit gate, and the last `[~]` on it. Go offline, submit, reconnect,
confirm it drains to **exactly one** row — never two, never zero.

Everything now leans on it: the Pending tab, the queue view, the automatic
online/offline switch, and the new exponential backoff. It is the largest
unverified risk in the system, and an agent cannot do it — it needs a person
signed in, in a real browser. Run it as `test.supervisor` on `TEST ROUTE`.

### 2. Test marks exist against real trainees

`TP ROUTE 3` accumulated submitted marks on real trainees during testing — 20
marks across 11 trainees when last counted, and the number moved several times
that day. `assessment_marks` is append-only with no `UPDATE` grant and the
revision UI is Phase 3, so on Monday those trainees show as assessed with marks
nobody awarded. What to do about them is the user's call; it has been raised
repeatedly and not yet actioned.

---

## Hard rule: never submit a mark against a real trainee

A "just testing" submission is permanent. Read-only checks against real data
are fine, and draft autosave is fine (pure IndexedDB). Submitting is not.

Use `test.supervisor` on `TEST ROUTE`, which now holds four IPT trainees — two
placeholder ones from `0011` and two with realistic particulars from `0018`,
added so the IPT form and its printed report can be judged honestly.

---

## Migration state — read this before applying anything

Applied live to `azlwxriyhdshfhklonrx`: `0000`–`0012`, `0014`, `0015`, `0016`,
`0017`, `0018`.

**`0015` and `0016` were run by hand in the SQL editor, so Supabase's
`list_migrations` does not list them.** They _are_ applied — confirmed by
querying the `reports_insert` policy and calling `report_path_trainee_id()`
directly. Do not re-run them on the strength of that listing.

`0013` (removes TEST ROUTE and `test.supervisor`) is written, reviewed and
**deliberately not applied**. It deletes the only safe place to exercise the
submit path. Not before the outbox test passes.

The recurring trap, which has now bitten twice: the CI auth stub drifts behind
whatever the newest migration reaches for. `0007` needed `auth.users.email`
and the pgTAP suite silently stopped running for two days; `0014` then needed a
whole `storage` schema. Check `packages/db/scripts/local-auth-stub.sql`
whenever a migration touches something new. Drizzle also regenerates columns
that hand-written migrations already added — `must_change_password` is the
standing example.

---

## E-mail: mostly built, not merged, not configured

`feat/result-email-and-criterion-comments` already contains the send path —
`apps/web/src/lib/notifications/` with `smtp.ts`, `brevo.ts`, `send.ts`,
`templates.ts`, `recipients.ts` and roughly 30 tests. **Do not build it
again.**

It is blocked on two things:

1. **Migration numbering collisions.** That branch carries a second `0016`,
   two `0017`s and two `0018`s, because it was cut before `0017`/`0018` landed
   on main. The pgTAP job applies `migrations/*.sql` in glob order, so they
   would run in alphabetical accident. It cannot merge cleanly until they are
   renumbered.
2. **Credentials.** Gmail SMTP from the dedicated `mvttc.assessment@gmail.com`
   with a Google App Password, set in Vercel's environment. The user holds
   these; an agent never handles them.

---

## Environment traps that have each cost hours

- **The git root is the `Header labels clip fix` directory**, not its parent.
  Run `git rev-parse --show-toplevel` before claiming otherwise.
- **Run `pnpm --filter` from the repo root.** The path has spaces — quote it.
- **`pnpm format:check` fails locally on Windows** (`core.autocrlf=true`, no
  `.gitattributes`) and is a false alarm. CI on Linux is unaffected. Check
  single files with `npx prettier --check <path>`.
- **Piping a build to `grep` hides its exit code.** A `pnpm build | grep …`
  that appears to pass may have failed. Check the status separately.
- **Only `admin-client.ts`'s `resolveEnv()` loads `.env` files.** Shell always
  wins.
- **The service-role key lives in the gitignored root `.env.local`.** The user
  runs the scripts that need it.
- **`packages/db/passwords.xlsx` holds 30 live permanent credentials.**
  Spreadsheets are gitignored repo-wide; never `git add -f` one, never print
  one.
- **Commit subjects must be lowercase** (commitlint `subject-case`).
- **An agent cannot type passwords into forms.** Browser-verifying a signed-in
  flow needs the user to sign in and hand the tab over.

---

## Deliberately deferred — say so, do not half-build

Admin console, TOTP, Excel export, audit-log viewer, backup panel, Swahili
interface strings, SMS/WhatsApp, pentest, accessibility audit, rate limiting.
All Phase 3/4 in `ROADMAP.md`, all weeks of work. None of them stops a
supervisor marking a trainee on Monday.

Branch protection on `main` is off — the user declined it. That is why five red
merges landed earlier in the week, and why `main` went red for two days without
anyone being told.

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
