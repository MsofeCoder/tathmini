# HANDOFF — account/session switch, 2026-09-04

Written for a fresh Claude Code agent picking this project up on a **new
Anthropic Pro account, same machine**. Nothing here overrides
`AGENTS.md` — it's a fast-orientation layer on top of the normal
session-start order `CLAUDE.md` already specifies (`AGENTS.md` →
`CONTEXT.md` → `ROADMAP.md` → `MEMORY.md`). Read those in full; this
file just tells you where to start and what not to re-derive. **This
file is disposable** — once its contents are stale or absorbed into
`MEMORY.md`, delete it.

## Where things actually stand

- Branch `phase-0/ipt-roster-support`, 4 new commits just made to turn
  this session's uncommitted work into a real checkpoint (`git log
--oneline -5`). Pushed to `origin` if the user approved it before you
  arrived — check `git status -sb`; if it says
  `phase-0/ipt-roster-support...origin/phase-0/ipt-roster-support`
  you're synced, if there's no upstream shown, push it yourself once
  you've confirmed the working tree is clean.
- Everything in `ROADMAP.md` Phase 0 is done and **live-verified**
  against the real Supabase project `azlwxriyhdshfhklonrx` (schema,
  RLS, pgTAP 18/18, all three instruments' criteria seeded, both real
  rosters imported: IPT 118 trainees/5 routes, TP 364 trainees/9
  routes).
- Phase 1: auth, the route list, and the trainee profile screen are
  done and browser-verified live. **The marking flow is next and does
  not exist yet** — that's this sprint's job.

## The 3-hour goal (the user's own scope call, this session)

Full Phase 1 (three instruments, offline/Dexie, service worker) is
not realistic in 3 hours — that was said plainly to the user and they
chose to narrow scope rather than pretend otherwise. Build **one
instrument, one assessor slot, online-only**, working end-to-end and
demoable:

1. IPT marking form (14 items, 6 sections, 1–5 rating scale) — chosen
   over TP because it's one instrument instead of two, and its Zod
   validation already exists (see below).
2. Submitting it must actually change what the route list and trainee
   profile show — that's the "tested ready" bar, not just a form that
   posts somewhere.
3. Explicitly **out of scope** for this sprint, stays unchecked on
   `ROADMAP.md`: TP Theory/TP Practical forms, offline/Dexie, service
   worker, PDF, notifications, second-assessor UI, admin console.

**One thing to flag to the user early, don't let them discover it
mid-demo:** `TEST ROUTE` (migration `0011`) only has an `a1` supervisor
assigned (`test.supervisor`) — no `a2`. `results.locked_at` only sets
once **both** slots submit (`recompute_result()`,
`0001_rls_and_functions.sql`). So submitting IPT marks as
`test.supervisor` will correctly move a trainee to `partial`
("Awaiting 2nd assessor") on the route list, but **never** to
`locked` — there's no second assessor to complete it. If a full
locked-state demo matters, that needs a second synthetic supervisor
account + an `a2` assignment first (a small follow-up migration, same
pattern as `0011` — show it, get a "GO" before applying, per
`AGENTS.md`).

## Environment / access — what's already there vs. what needs the user

- **Supabase MCP tools** (`mcp__supabase__*`) — should already be
  connected in Claude Code on this machine; this is a tool
  configuration, not tied to the Anthropic account. Confirm early with
  `list_tables` against `azlwxriyhdshfhklonrx` before assuming
  anything is missing.
- **`apps/web/.env.local`** — already exists, gitignored, has the real
  `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`. No action
  needed; don't ask the user to redo this.
- **No repo-root `.env.local`** for `packages/db` scripts — that's
  fine, this sprint's scope doesn't need `SUPABASE_SERVICE_ROLE_KEY`
  (no new accounts, no roster changes).
- **`claude-in-chrome` browser tools** — used all session for live
  verification; same pattern works here. Test login:
  `test.supervisor` / `NewTestPass456!`. 5 synthetic trainees on
  `TEST ROUTE`: `TEST TRAINEE 1`–`3` are TP, `4`–`5` are IPT.
- **Dev server port**: `next dev` has landed on 3000, 3001, and 3002
  across this session because stale processes piled up — always read
  the dev server's own background-task log for the port it actually
  bound to, never assume 3000.

## The exact DB contract the marking form has to satisfy

Researched this session, not yet built against. `packages/db/src/schema.ts`

- `packages/db/migrations/0001_rls_and_functions.sql`:

1. **`instruments`**/**`criteria`** are already seeded live. IPT:
   `instruments.code = 'ipt'`, 14 rows in `criteria` where
   `instrument_id` matches, 6 sections (`A`–`F`), ordered by
   `order_index`. Each item's `item_max` is `5` (the rating scale
   ceiling doubles as the item's point value — no separate scaling).
2. **Submission is two inserts, not one**, and the order matters:
   - Insert one row into `assessment_marks` (`trainee_id`,
     `instrument_id`, `supervisor_id = auth.uid()`, `slot` = the
     signed-in supervisor's own slot for this trainee from
     `assignments`). RLS's `assessment_marks_insert` policy requires
     an `assignments` row matching exactly this
     trainee/supervisor/slot — get the id back.
   - Insert **all 14** `assessment_mark_items` rows
     (`assessment_mark_id`, `criterion_id`, `score`, `comment`) in a
     **single** `.insert([...])` call. The `assessment_mark_items_finalize`
     trigger (AFTER INSERT, statement-level) checks the count of items
     for that `assessment_mark_id` against the instrument's real
     criteria count — anything less than all 14 in the same statement
     gets the **whole insert rejected**, not partially accepted. Only
     on a match does it stamp `assessment_marks.total`/`submitted_at`,
     which then fires `assessment_marks_recompute_result` and updates
     `results`.
   - **Known rough edge, not yet decided**: because it's two separate
     round trips, a client that creates the `assessment_marks` row and
     then fails/crashes before the items insert leaves an orphaned
     empty mark row (harmless — `total`/`submitted_at` stay null,
     nothing recomputes off it — but it also means a naive retry needs
     to detect and reuse that existing row rather than re-insert one,
     since `assessment_marks_trainee_instrument_slot_idx` is unique).
     A cleaner alternative is a `SECURITY DEFINER`/`SECURITY INVOKER`
     Postgres function (`submit_assessment_mark(trainee_id,
instrument_id, items jsonb)`) that does both inserts in one
     transaction — **that's a schema change**, show it and get
     explicit approval before applying it, same as every migration
     this session.
3. **Validation already exists**, don't rebuild it:
   `packages/shared/src/schemas.ts` — `iptCriterionMarkSchema` (1–5,
   no zero, comment required at ≤3) and `assertComplete()` (gating —
   every criterion must be scored, no partial count). Both have
   existing Vitest coverage in `packages/shared/src/schemas.test.ts`.

## Behavioural spec (per `AGENTS.md`, read before designing the screen)

`reference/Tathmini.dc.html`'s `showAssess` (`st.screen === 'assess'`,
line 416 on) is the marking screen. The IPT-specific 1–5 rating-scale
comment is at line 1596/2614. Read the surrounding markup the same way
the route-list and trainee-profile plans did before writing any
component — don't invent a layout.

## Gotchas already hit this session — don't rediscover these

- **Postgres `numeric` columns come back from PostgREST/`supabase-js`
  as strings**, not numbers — `assessment_marks.total`,
  `criteria.item_max`/`section_max`, `results.pct`/`gpa` will all hit
  this. Coerce with `Number(...)` before doing arithmetic (see
  `trackPointsLabel()`'s usage in `apps/web/src/app/trainee/[id]/page.tsx`
  for the pattern already in place).
- **`import.meta.url === \`file://${process.argv[1]}\``never matches
on Windows** — irrelevant to this sprint's UI work, but if you touch
any CLI script's entry-point guard, use`pathToFileURL(process.argv[1]).href`.
- **Browser automation**: use `find` + element `ref`s, not remembered
  pixel coordinates — a page that shifts layout between screenshots
  (an error banner, a pending state) makes a coordinate-based click
  miss silently.
- **`commitlint`** rejects a Sentence-case/Start-case subject after the
  `type(scope):` prefix — lowercase the first word (`db: fix ...`, not
  `db: Fix ...`).
- **`git push`** may get blocked by the local auto-mode permission
  classifier even after the user approves in chat — that's a
  harness-level gate, not something to route around; tell the user to
  run it themselves with `!git push ...` if it happens again.

## Non-negotiables — don't relax these under time pressure

Straight from `AGENTS.md`, and the whole reason this project has held
up under a fast pace so far:

- Authorization lives in RLS/Postgres, never a client-side role check.
- `assessment_marks`/`assessment_mark_items` are append-only — no
  "edit and resubmit" UI; the DB's reject-whole-statement behaviour on
  an incomplete submission is the only correction path pre-submit.
- Scores/totals/grades are server/trigger-computed, never trusted from
  the client, even for a "just this once" progress preview.
- **Stop and ask** before any migration, RLS change, or auth change —
  including the `submit_assessment_mark()` RPC idea above, if you go
  that way.
- Criterion wording is verbatim from `reference/forms/` — already
  seeded correctly for IPT, just don't re-type it anywhere in the UI
  from memory.
- Update `MEMORY.md` after every feature/decision/fix, and **commit as
  you go** — don't let a whole sprint's worth of work sit uncommitted
  again like this one did; that's exactly what made this handoff
  necessary in the first place.
