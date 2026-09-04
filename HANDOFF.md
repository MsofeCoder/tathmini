# HANDOFF — account/session switch, internal-use sprint to Monday

Written for a fresh Claude Code agent picking this project up on a **new
Anthropic Pro account, same machine**. Nothing here overrides
`AGENTS.md` — it's a fast-orientation layer on top of the normal
session-start order `CLAUDE.md` already specifies (`AGENTS.md` →
`CONTEXT.md` → `ROADMAP.md` → `MEMORY.md`). Read those in full; this
file just tells you where to start and what not to re-derive. **This
file is disposable** — once its contents are stale or absorbed into
`MEMORY.md`, delete it.

## The real deadline (superseded an earlier, narrower plan — read this,

not any prior 3-hour/IPT-only framing left in `MEMORY.md`)

Two hard dates from the user, given 2026-09-04 (Friday):

- **Saturday 2026-09-05, evening: last training/demo.** The app needs
  to be walked through live.
- **Monday 2026-09-07: real internal use begins**, for both **IPT and
  TP** assessment by actual supervisors in the field.

Explicit user framing: **internal use only, for now** — full
production polish (Swahili translation review, PDF/e-mail/SMS,
full admin console, pentest, accessibility audit, rate limiting,
backup panel) is deliberately **deferred to the next round**, not
part of this sprint. What Monday genuinely needs: **simple, scalable,
offline-first, both tracks working.**

## What "offline-first" means for THIS deadline — a deliberate, agreed cut

Full offline rigor (installable PWA, Background Sync API with
exponential backoff, formal force-quit/reboot-in-airplane-mode
survival testing) was originally sized as roughly a third of all of
Phase 1 — not realistic before Monday. The user explicitly agreed to
this narrower cut instead:

1. **Local draft autosave** — every criterion score/comment saves to
   IndexedDB (Dexie) as the supervisor works, not just on submit.
   Reopening a trainee (even after a crash/reload) restores the draft.
   Build this in from the start of the marking UI, not bolted on after
   — it's cheap to include from day one and is most of what "never
   lose typed marks in a dead zone" actually requires.
2. **A Dexie-backed submit queue** — if the two-insert submit (below)
   fails because there's no connectivity, queue it locally with an
   idempotent key and retry when the browser's `online` event fires or
   on next app focus. **Not** the Background Sync API (needs a
   registered service worker event with browser support caveats) —
   plain retry-on-reconnect is enough for this deadline and is much
   less to get right.
3. **A basic service worker** — caches the app shell (JS/CSS/fonts,
   the login/home/trainee/marking routes) so the app still **loads**
   with no connectivity. Not full precise asset-perfect offline, not
   installability polish (manifest/maskable icons can follow later) —
   just "a supervisor already at a remote VTC with a weak signal can
   open what's already loaded and keep working."

**Explicitly NOT this round**: Background Sync API, install
prompts/maskable icons, a formal reboot-survival test suite, a
pending-sync badge/queue viewer UI (nice-to-have, not blocking —
a supervisor can tell it queued from a simple inline banner). Note
these as real gaps in `ROADMAP.md`, don't silently mark that Phase 1
line fully done until they're actually built later.

## Build order to hit both dates

**For the Saturday evening demo** (needs: both tracks marking
end-to-end, gating, draft autosave — offline queueing is nice but not
demo-critical, a demo can reasonably run on a real connection):

1. TP Theory marking form — points-scale (0..max in 0.5 steps, comment
   required below half), reuses `pointsCriterionMarkSchema()` in
   `packages/shared/src/schemas.ts` (already built, already tested).
2. TP Practical marking form — same schema, different criteria set
   (34 items, 5 sections — remember the vii/viii transcription note in
   `MEMORY.md`, don't re-derive the numbering from the source docx).
3. IPT marking form — 1–5 rating scale, comment required at ≤3, no
   zero, reuses `iptCriterionMarkSchema()` (already built, already
   tested).
4. Gating wired to `assertComplete()` (already built) — block submit,
   list unscored items with jump-links, exactly as `AGENTS.md`/
   `ROADMAP.md` specify.
5. Draft autosave (Dexie) from the start, per above.
6. Submit → the exact `assessment_marks` + `assessment_mark_items`
   two-insert contract below.
7. Confirm the route list and trainee profile (already built) reflect
   a real submission correctly — this is the actual "does it work"
   proof for the demo, not just a form that posts somewhere.

**For Monday** (add on top of the above, over the weekend):

8. The Dexie submit queue + retry-on-reconnect.
9. The basic service worker (app-shell caching).
10. A real airplane-mode manual test: mark a trainee offline, confirm
    it queues (don't lose the draft), reconnect, confirm it syncs and
    the route list updates. Lighter than the formal exit-gate test,
    but must actually be exercised, not assumed.

## One operational thing that is NOT a code task — flag to the user directly

Real supervisor accounts (30 of them, from this session's roster
imports) got one-time passwords printed to a script's stdout, and the
**full output including those passwords was pasted into this chat
twice** (see `MEMORY.md`'s IPT/TP roster-import entries). Those
passwords must be treated as exposed. **Before Monday, the user needs
to reset each real account's password via the Supabase dashboard** (or
have `create-accounts.ts` re-run in a "reset" mode if that's built) —
this is not something the agent can safely infer is already handled,
and it blocks real people actually logging in safely. Ask directly
rather than assuming it's done.

Separately: confirm who is actually running Saturday's demo and on
what device — if it's a phone/tablet in the field rather than this
dev machine's browser, that changes what "tested" needs to mean
(real mobile Chrome/Safari, not just the desktop Chrome extension used
for verification all session).

## What's already done and verified live (don't rebuild)

- **Phase 0**: full schema, RLS (default-deny, 18/18 pgTAP), all three
  instruments' criteria seeded verbatim, both real rosters imported
  (IPT 118 trainees/5 routes, TP 364 trainees/9 routes) — this already
  covers "scalable": RLS scopes correctly to the full real dataset,
  nothing here is sized for test data only.
- **Phase 1 so far**: auth (sign-in, forced password change, session
  cookies), the supervisor route list, the trainee profile screen —
  all browser-verified live against real Supabase.
- **Validation**: `packages/shared/src/schemas.ts` — both criterion-
  mark schemas and `assertComplete()` gating, already tested.
- All of the above is now committed on `phase-0/ipt-roster-support`
  (5 commits made during this handoff) — check `git log --oneline -6`
  and `git status -sb` for whether it's pushed; push it yourself if
  not (`git push -u origin phase-0/ipt-roster-support`) — a prior
  attempt was blocked by this session's own tool-permission classifier,
  not a real error.

## Deferred to the next round — say so explicitly, don't half-build these

Per the user's own words, not a unilateral cut: PDF generation, e-mail/
SMS/WhatsApp notifications (Brevo/Beem — no accounts provisioned
anyway), full admin console (route management, reassignment workflow,
override, exports, audit viewer), TOTP, backup panel, Swahili
translation review, accessibility audit, penetration test, rate
limiting/CSP hardening. Accounts/routes/trainees continue to be
managed the way this whole session already did it — direct migrations
run by the developer, not an admin UI — that's fine for "internal use
only, small known group of supervisors."

## Environment / access — what's already there vs. what needs the user

- **Supabase MCP tools** (`mcp__supabase__*`) — should already be
  connected in Claude Code on this machine; this is a tool
  configuration, not tied to the Anthropic account. Confirm early with
  `list_tables` against `azlwxriyhdshfhklonrx`.
- **`apps/web/.env.local`** — already exists, gitignored, has the real
  Supabase URL/anon key. No action needed.
- **No repo-root `.env.local`** for `packages/db` scripts — fine
  unless the password-reset task above needs `create-accounts.ts`
  re-run, which needs `SUPABASE_SERVICE_ROLE_KEY` from the user.
- **`claude-in-chrome` browser tools** — used all session for live
  verification. Test login: `test.supervisor` / `NewTestPass456!`. 5
  synthetic trainees on `TEST ROUTE` (`TEST TRAINEE 1`–`3` TP, `4`–`5`
  IPT), assigned to `test.supervisor`'s `a1` slot only — no `a2`, so
  a submitted mark there will show `partial`, never `locked`. Real
  routes (imported from the actual rosters) all have real `a1`+`a2`
  pairs already, so this only matters for dev testing, not Monday's
  real usage.
- **Dev server port**: `next dev` has landed on 3000, 3001, and 3002
  across this session from stale processes piling up — always read the
  dev server's own background-task log for the port it actually bound
  to.

## The exact DB contract the marking forms have to satisfy

`packages/db/src/schema.ts` + `packages/db/migrations/0001_rls_and_functions.sql`:

1. **`instruments`**/**`criteria`** already seeded live for all three
   codes (`tp_theory`, `tp_practical`, `ipt`). Fetch by `instruments.code`,
   join `criteria`, order by `order_index`. IPT's `item_max` is `5` per
   item (the rating scale ceiling doubles as the point value).
2. **Submission is two inserts, not one, and the order matters**:
   - Insert one row into `assessment_marks` (`trainee_id`,
     `instrument_id`, `supervisor_id = auth.uid()`, `slot` = the
     signed-in supervisor's own slot for this trainee from
     `assignments`). RLS's `assessment_marks_insert` policy requires a
     matching `assignments` row — get the new row's id back.
   - Insert **all** `assessment_mark_items` rows for that instrument
     (`assessment_mark_id`, `criterion_id`, `score`, `comment`) in a
     **single** `.insert([...])` call. The
     `assessment_mark_items_finalize` trigger (statement-level, AFTER
     INSERT) checks the item count against the instrument's real
     criteria count — anything incomplete in that one statement gets
     the **whole insert rejected**. Only a complete match stamps
     `assessment_marks.total`/`submitted_at`, which fires
     `assessment_marks_recompute_result` and updates `results`.
   - **Known rough edge**: two separate round trips means a crash
     between them leaves an orphaned empty `assessment_marks` row
     (harmless — nothing recomputes off null `total`/`submitted_at` —
     but a retry must reuse that row, not re-insert, since
     `assessment_marks_trainee_instrument_slot_idx` is unique). Given
     the Dexie submit queue is already handling retry logic for this
     sprint, it's reasonable to have the queue's retry path look up
     and reuse an existing unfinished `assessment_marks` row rather
     than building a `submit_assessment_mark()` RPC to make it atomic
     — that RPC is a legitimate future improvement (needs a migration,
     show it and get approval first per `AGENTS.md`), not required to
     hit Monday.
3. **Validation already exists** — `packages/shared/src/schemas.ts`,
   see above. Don't rebuild it.

## Behavioural spec (per `AGENTS.md`, read before designing any screen)

`reference/Tathmini.dc.html`'s `showAssess` (`st.screen === 'assess'`,
line 416 on) is the marking screen; the IPT-specific 1–5 rating-scale
comment is around line 1596/2614. Read the surrounding markup before
writing any component, the same discipline the route-list and
trainee-profile screens followed — don't invent a layout, and don't
skip it just because the deadline is tight; skipping it is what
produces rework, not what avoids it.

## Gotchas already hit this session — don't rediscover these

- **Postgres `numeric` columns come back from PostgREST/`supabase-js`
  as strings** — `assessment_marks.total`, `criteria.item_max`/
  `section_max`, `results.pct`/`gpa` will all hit this. Coerce with
  `Number(...)` before arithmetic (see `trackPointsLabel()`'s usage in
  `apps/web/src/app/trainee/[id]/page.tsx`).
- **`import.meta.url === \`file://${process.argv[1]}\``never matches
on Windows** — if you touch a CLI script's entry-point guard, use`pathToFileURL(process.argv[1]).href`.
- **Browser automation**: use `find` + element `ref`s, not remembered
  pixel coordinates — a page that shifts layout between screenshots
  makes a coordinate-based click miss silently.
- **`commitlint`** rejects a Sentence-case/Start-case subject after the
  `type(scope):` prefix — lowercase the first word.
- **`git push`** may get blocked by the local auto-mode permission
  classifier even after the user approves in chat — a harness-level
  gate, not something to route around; the user runs it themselves
  with `!git push ...` if it happens again.

## Non-negotiables — the deadline cuts polish, not these

Straight from `AGENTS.md`. Everything deferred above is genuinely
deferrable; none of this is:

- Authorization lives in RLS/Postgres, never a client-side role check.
- `assessment_marks`/`assessment_mark_items` are append-only — no
  "edit and resubmit" UI.
- Scores/totals/grades are server/trigger-computed, never trusted from
  the client.
- **Stop and ask** before any migration, RLS change, or auth change.
- Criterion wording is verbatim from `reference/forms/` — already
  seeded correctly for all three instruments; don't re-type it from
  memory in the UI.
- Update `MEMORY.md` after every feature/decision/fix, and **commit as
  you go** — don't let a weekend's worth of work sit uncommitted; that
  exact situation is what made this handoff necessary in the first
  place.
