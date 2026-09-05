# MEMORY.md

Append-only project log. **Newest entry at the top.** Never edit or delete an
old entry — if something turned out to be wrong, write a new entry saying so and
link back to it.

One entry per feature shipped, decision made, or bug fixed.

## Entry format

Copy this block, fill it in, put it directly under this heading.

```markdown
## YYYY-MM-DD · <kind> · <one-line title>

**Kind:** feature | decision | bugfix | migration | security | ops
**Phase:** 0–5
**Commit / PR:** <sha or #number>

**What changed**
One or two sentences. What now exists that did not before.

**Why this way**
The reasoning a future maintainer will not be able to reconstruct from the
code. What you rejected and why matters more than what you chose.

**Watch out for**
Anything surprising, fragile, or easy to break. Delete this line if there is
genuinely nothing.

**Verified by**
The test, query or manual check that proves it works.
```

### What is worth an entry

- Any decision a future maintainer would otherwise have to guess at
- Every migration, with what it did to existing rows
- Every bug whose cause was not obvious from the symptom
- Any deviation from `AGENTS.md`, and the user's approval for it
- Any assumption you had to make because a question in `PLAN.md` was unanswered

### What is not

Routine commits, formatting, dependency bumps, or anything already legible from
the diff. This file is for knowledge that would otherwise be lost.

---

## 2026-09-05 · bugfix · site was never installable — no manifest, and middleware blocked the one added

**Kind:** bugfix
**Phase:** 1
**Commit / PR:** (pending)

**What changed**
Added `apps/web/src/app/manifest.ts` (Next.js native manifest route),
generated icon assets (`public/icons/icon-{192,512}.png`,
`icon-maskable-{192,512}.png`, `src/app/apple-icon.png`, `public/favicon.ico`)
in the existing deep-teal `#0d4a43` palette with the prototype's "TM" mark, and
added `theme-color` / `appleWebApp` metadata to `layout.tsx`. Also added
`manifest\.webmanifest` to the auth middleware's matcher exclusion list.

**Why this way**
The app had a working service worker (Serwist) but no web app manifest at
all — Chrome's install-prompt criteria need both, so the "download the PWA"
experience the user expected on first visiting the live URL never fired.
Fixing the manifest alone wasn't enough: `middleware.ts` redirects every
unauthenticated request to `/login`, and `/manifest.webmanifest` isn't a
static-asset extension, so it matched the auth gate and a first-time
(signed-out) visitor's browser got a `307` redirect body instead of manifest
JSON — silently killing installability rather than erroring. Excluded it the
same way `sw.js` already is, per the existing comment in that file explaining
why service-worker-adjacent assets can't go through the session check.
Icons are placeholder — no logo asset exists yet in the repo (checked
`reference/` for `mvttc-logo.png`, not present); swap in the real crest once
provided.

**Watch out for**
`start_url: '/home'` in the manifest — this is *itself* auth-gated (by
design, per `PUBLIC_PATHS` in `middleware.ts`), so an installed icon still
routes through `/login` for a signed-out user. That's correct behavior, not
a bug — do not add `/home` to `PUBLIC_PATHS` to "fix" it.

**Verified by**
`pnpm lint && pnpm test && pnpm typecheck` green; `pnpm build` succeeds and
lists `/manifest.webmanifest` and `/apple-icon.png` as generated routes;
manual check against a local `pnpm start` server confirmed
`/manifest.webmanifest` returns `200` with valid JSON while unauthenticated
(previously `307` to `/login`), and that `/home` is still correctly gated.
---

## 2026-09-05 · security · Supabase env vars dropped the NEXT_PUBLIC_ prefix; unused browser client deleted

**Kind:** security
**Phase:** 1
**Commit / PR:** (pending)

**What changed**
`NEXT_PUBLIC_SUPABASE_URL` → `SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` → `SUPABASE_ANON_KEY`, everywhere they
are read: `apps/web/src/lib/supabase/server.ts`,
`apps/web/src/middleware.ts`,
`packages/db/src/scripts/create-accounts.ts`, plus `.env.example`,
`README.md` and the local `apps/web/.env.local`.

`apps/web/src/lib/supabase/client.ts` (a `createBrowserClient` wrapper)
was deleted. Nothing imported it — confirmed by grep and by scanning
every client chunk of the deployed bundle, which contains no Supabase
URL at all. After the rename it would have read two `undefined` values
in the browser, so leaving it in place was a trap rather than a
convenience. Restore it from git history if a browser client is ever
genuinely needed, and give it its own explicitly public env vars.

**Why this way**
The prefix was never doing anything. Every Supabase call in this app is
server-side — server components, Server Actions, and the middleware
session check — so `NEXT_PUBLIC_` only inlined both values into the
client bundle for no benefit. The anon key is public by design and RLS
is the real boundary, so this is defence in depth, not a fix for a
vulnerability: it narrows what ships to a shared field device.

**Watch out for**
Two things.

1. **The Vercel environment variables must be renamed to match**, or
   every sign-in fails. There is no error: the app renders normally and
   the Server Action returns the ordinary "That username and password do
   not match an account issued by the Administrator" copy, because
   `signInWithPassword` simply errors and `login/actions.ts` maps any
   error to that one message. It reads as a bad password, not as
   misconfiguration.
2. That exact failure was already live on
   `https://tathmini-web.vercel.app` **before** this change, with the
   old names — `test.supervisor` was rejected in a real browser while
   the same credentials authenticated fine against
   `azlwxriyhdshfhklonrx` directly and through a local dev server on the
   same `.env.local`. So the deployed project's variables were already
   wrong (mismatched, truncated, or Preview-only). Renaming them is now
   the same operation as fixing them.

Also fixed in passing: `pnpm lint` had been failing since the Next
15.5 upgrade because the regenerated `next-env.d.ts` emits a
triple-slash reference to `.next/types/routes.d.ts`. It is generated and
self-documented as "should not be edited", so it is now in
`apps/web/eslint.config.mjs`'s `ignores`.

**Verified by**
`pnpm lint && pnpm test && pnpm typecheck` clean (112 tests),
`pnpm format:check` clean, `pnpm --filter @tathmini/web build` clean
with every route under the 180 KB budget. Then a real Chromium browser
(mobile viewport, over the LAN at `172.16.11.190:3187`) signed in as
`test.supervisor` and landed on `/home` with the real route list —
proving the renamed variables resolve at runtime in both the middleware
and the Server Action. Confirmed afterwards that no built client chunk
contains the project ref or the key.

---

## 2026-09-04 · feature · Offline marking made real: route snapshot in IndexedDB, /offline entry point, submit outbox, service worker

**Kind:** feature
**Phase:** 1
**Commit / PR:** (pending — see below)

**What changed**
Three ROADMAP.md Phase 1 lines' worth of offline work, plus the thing
none of them named that turned out to be the actual requirement.

1. **Submit outbox** (`apps/web/src/lib/outbox.ts`, `apps/web/src/app/
   outbox-drainer.tsx`): a completed assessment that cannot reach the
   server is queued in Dexie and replayed on the browser's `online`
   event and on regaining focus. `submitAssessment()` moved to
   `apps/web/src/app/actions/submit-assessment.ts` (two callers now) and
   returns a machine-readable failure code; its contract types live in
   `apps/web/src/lib/submission.ts` so a Server Action and a client
   component can share them.
2. **Offline route snapshot** (`apps/web/src/lib/offline-cache.ts`): one
   online load of the route list writes the whole route — every trainee,
   this supervisor's slot for each, which instruments they've already
   submitted, and all three instruments' criteria — into IndexedDB, and
   prefetches `/offline` so its JavaScript is in the service worker's
   cache too.
3. **`/offline`** (`apps/web/src/app/offline/page.tsx`): a public,
   client-rendered, statically prerendered page that reads that snapshot
   and renders the *same* `MarkingForm` the online route does (moved to
   `apps/web/src/components/marking-form.tsx`, now shared). Marking there
   is the real thing, not a degraded copy.
4. **Service worker** (`apps/web/src/app/sw.ts`, Serwist per AGENTS.md's
   fixed stack): precaches `/offline`, serves it as the fallback whenever
   a navigation fails.

**Why this way**
The premise in HANDOFF.md item 9 — that "a basic service worker caching
the app shell" would let a supervisor keep working at a remote VTC — is
not achievable as written, and this is the important finding. Every
screen except `/login` is server-rendered against Supabase, and
`middleware.ts` calls `supabase.auth.getUser()` (a network call) on
every request. With no connection the device cannot reach the Next.js
server at all, so middleware never runs and no amount of asset caching
produces those pages. Offline therefore has to be a client-rendered page
fed from data the app deliberately cached — which is what `/offline` is.

Caching the whole route on one online visit (rather than caching each
trainee's marking screen as it's opened) is what makes this usable: a
supervisor arms the entire route by opening the route list once in town,
instead of having to pre-open all ~40 trainees.

Deliberately **not** caching Supabase responses or server-rendered HTML
in the service worker: those are per-user, RLS-scoped, often personal,
and an opaque HTTP cache on a shared device is the wrong place for them.
Everything offline comes from IndexedDB, written deliberately.

**Watch out for**
Three real bugs found by verifying rather than assuming, all of which
would have shipped silently:

1. **`/sw.js` was being redirected to `/login`.** `middleware.ts`'s
   matcher didn't exclude it, and a service worker script served as a
   redirect fails registration outright per spec — the entire offline
   feature would have been dead on arrival, with no error anywhere
   obvious. The matcher now excludes `sw.js` and `swe-worker-*.js`.
2. **Serwist's `reloadOnOnline` defaults to `true`** — it reloads the
   page whenever connectivity returns. In the field, where signal flaps
   constantly, that means reloading a supervisor mid-assessment.
   Disabled; `OutboxDrainer` already syncs on the same event and
   refreshes only when something actually sent.
3. **ESLint was linting the generated `public/sw.js`** (87 errors on
   minified output). Added to `eslint.config.mjs` and `.prettierignore`
   ignores; the file is gitignored.

Also worth knowing: `@serwist/next`'s precache manifest only covers the
`public/` directory — Next's own hashed chunks are handled by Serwist's
default *runtime* caching, cache-first. That is why the route list
prefetches `/offline`: without it, a supervisor who never opened
`/offline` while online would have the cached data but not the
JavaScript to render it.

`/offline` is a public path in `middleware.ts`. That is deliberate and
safe — it carries no server data of its own and everything it shows
comes from the device's own IndexedDB — but it does mean the offline
route snapshot lives unencrypted in IndexedDB on the supervisor's phone.
That is a real (and previously implicit) consequence of offline-first
worth raising with the College before wider rollout; RLS still governs
every actual read and write.

**Not verified in a browser.** No browser-automation tool was available
this session. Everything below was proven by build/type/lint/test and by
HTTP-level checks against a real production server; the actual offline
journey (go offline → navigate → service worker serves `/offline` → mark
→ queue → reconnect → sync) has NOT been exercised on a real device, and
must be before Monday.

**Verified by**
`pnpm lint && pnpm test && pnpm typecheck` clean across all workspaces
(38 web tests, +3 for the outbox drain classifier); `pnpm format:check`
clean; `pnpm --filter @tathmini/web build` clean with every route under
the 180 KB first-load budget (`/offline` 144 kB, marking route 142 kB).
Against a real `next start` production server: `/sw.js` returns 200
`application/javascript` (42 KB) after the matcher fix — it returned a
307 redirect before it; `/offline` returns 200 without a session;
`/home` and `/trainee/[id]` still return 307 to `/login` unauthenticated,
confirming the new public path didn't widen the auth gate. Service
worker registration confirmed present in the built `main-*.js`, and
`/offline` confirmed present in the generated precache manifest.

---

## 2026-09-04 · migration · Fixed validate_and_finalize_mark() — never had SECURITY DEFINER, so no real submission could ever finalize

**Kind:** migration
**Phase:** 1
**Commit / PR:** (pending — see below)

**What changed**
`packages/db/migrations/0012_fix_finalize_mark_security_definer.sql` adds
`security definer set search_path = public` to
`validate_and_finalize_mark()` (0001_rls_and_functions.sql) — it was
missing that attribute entirely. Applied live to `azlwxriyhdshfhklonrx`
after showing the SQL and getting explicit approval (AGENTS.md).

**Why this way**
Found the hard way: the very first live end-to-end test of the new
marking flow's two-insert submit contract (see the feature entry below)
inserted a complete set of `assessment_mark_items` successfully, then
failed with `42501 permission denied for table assessment_marks` —
`validate_and_finalize_mark()`'s own `update assessment_marks set total
= ..., submitted_at = ...` was running as the invoking `authenticated`
role, which has `UPDATE` revoked on `assessment_marks` by design
(AGENTS.md rule 2: marks are append-only). Its sibling function,
`recompute_result()`, already has the correct `security definer set
search_path = public` attribute — this one was simply missed when
`0001` was written. Same fix pattern as `0004`'s `chain_audit_log()` fix.

This is safe precisely because the function's own logic already gates
the write correctly (rejects an already-submitted mark, rejects an
incomplete item count) — `security definer` grants it the privilege to
perform a write its own checks already control, not a new capability an
authenticated client can reach directly.

**Watch out for**
This bug existed from the moment `0001` was first applied
(2026-09-04, see the "Phase 0 migrations 0000–0004 applied" entry) and
was never caught: the pgTAP suite's own complete-submission assertion
(`phase0.sql` line ~99–107) inserts `assessment_mark_items` as the
`postgres` superuser (only the RLS-specific assertions wrap themselves in
`set role authenticated`), so it never actually exercised this trigger
under the same role a real client uses. **No number of pgTAP passes
proved a real submission could finalize** — only a live insert as the
`authenticated` role, through the real login path, could have caught
this. Worth remembering generally: a trigger that writes to a
REVOKE-protected table needs its own explicit `authenticated`-role test,
not just coverage via a superuser fixture.

Caught by a one-off Node script (not part of the app, run then
discarded) that signs in as `test.supervisor` via the Supabase Auth REST
API and replays the exact insert sequence `submitAssessment()` performs
— see the feature entry below for the three real submissions this
produced against `TEST ROUTE`.

**Verified by**
Re-ran the same script immediately after applying the migration: TP
Theory (41 items) and TP Practical (34 items) for `TEST TRAINEE 1`, and
IPT (14 items) for `TEST TRAINEE 4`, each finalized correctly — `total`/
`submitted_at` stamped, `results` recomputed with the right `pct`/
`grade`/`gpa`/`class_of_award`/`competent`, `locked_at` correctly still
null (these test trainees only have an `a1` assignment, no `a2`).

---

## 2026-09-04 · feature · Criterion-by-criterion marking built (TP Theory, TP Practical, IPT) and verified live

**Kind:** feature
**Phase:** 1
**Commit / PR:** (pending — see below)

**What changed**
One reusable route, `/trainee/[id]/mark/[instrument]`, drives all three
instruments entirely from what's live in `instruments`/`criteria` —
never a hardcoded criteria list in the app. `apps/web/src/lib/marking.ts`
(new, unit-tested) holds the pure scoring/gating rules: 0..max in 0.5-step
score options for the points scale, the fixed 1–5 IPT scale, the same
below-half / ≤3 flag thresholds `packages/shared/src/schemas.ts` already
defines, section grouping/subtotals, and `computeGaps()` — the submit-time
gate that reports both an unscored criterion and a scored-but-flagged one
missing its required comment, each with a jump target.

Per HANDOFF.md's agreed cut for this sprint: `apps/web/src/lib/drafts.ts`
(Dexie, new dependency — already named in AGENTS.md's fixed stack) persists
every score/comment to IndexedDB, keyed per (trainee, instrument), restored
on mount — built in from the start of the marking UI, not bolted on after.
This is local draft-only; the actual offline submit queue and service
worker are still unbuilt (ROADMAP.md).

`actions.ts`'s `submitAssessment()` implements HANDOFF.md's exact two-insert
contract: re-validates completeness and every mark server-side against the
same shared Zod schemas (never trusts the client's own gate), reuses an
existing unfinished `assessment_marks` row rather than re-inserting if one
exists (the documented orphaned-row scenario), then inserts every
`assessment_mark_items` row in one call. `trainee/[id]/page.tsx` gained
"Start"/"Submitted ✓" buttons per instrument for the trainee's track,
scoped to only render when the signed-in supervisor actually holds an
assignment for this trainee.

**Why this way**
Chose one scrollable page per instrument (sections top to bottom, each with
a running subtotal, sticky progress header, gating banner) over the
prototype's multi-step wizard with a separate jump-menu and a distinct
merged "Comments" step — the prototype's `showAssess` (reference/
Tathmini.dc.html lines 416+) is a considerably larger interaction than
what HANDOFF.md's narrowed Saturday/Monday scope calls for, and the
schema models a comment **per criterion**, not one merged per-instrument
comment the auto-comment phrase bank writes into — that phrase bank
(ROADMAP.md, still unchecked) is explicitly not part of this cut. Gating,
the below-half/≤3 comment trigger, and "unscored counts as zero, never
submit incomplete" are all preserved from the prototype; the step-wizard
navigation chrome is the deliberate simplification, not the correctness
rules.

**Watch out for**
See the migration entry above — the first live test of this exact
contract caught a real bug in `validate_and_finalize_mark()`, now fixed.

Building this is what produced three permanent live submissions against
`TEST ROUTE`: `TEST TRAINEE 1` now has both `tp_theory` (50/50) and
`tp_practical` (50/50) submitted by `test.supervisor`'s `a1` slot, and
`TEST TRAINEE 4` has `ipt` (70/70) submitted the same way. All three show
`locked_at` null (only `a1` exists for these test trainees, never `a2`) —
expect the route list to now show these two as `partial`, not `pending`,
when next viewed; this is real submitted data, not a bug, and per
AGENTS.md rule 2 these rows cannot be un-submitted.

Not built this round, deliberately: the Dexie **submit queue**
(retry-on-reconnect) and the service worker (HANDOFF.md items 8–9) —
today a submit attempted fully offline will just fail with a network
error, caught and shown as `submitError`, not queued. The draft itself
still survives (Dexie draft-save is independent of submit). This is the
next unit of work before Monday.

No browser-automation tool was available in this session (unlike prior
entries' `claude-in-chrome` verification) — this feature was verified via
`pnpm lint && pnpm test && pnpm typecheck` (35 web tests, +15 new for
`marking.ts`), a clean `next build` (140 kB first-load JS for the marking
route, under the 180 KB budget), and the live Node-script submissions
above, which exercise the identical code path `actions.ts` uses. The
actual React UI (score buttons, gating banner, draft restore-on-reload)
has **not** been visually verified in a real browser — flagged directly
so this isn't mistaken for the same level of proof prior entries have.

**Verified by**
`pnpm lint && pnpm test && pnpm typecheck` clean across all workspaces;
`pnpm format:check` clean repo-wide; `pnpm --filter @tathmini/web build`
clean. Three live submissions against `azlwxriyhdshfhklonrx` (see above),
each producing the correct `results` row (grade/GPA/class/competent) —
the strongest available proof of the actual insert contract, though not
of the React UI itself (see "Watch out for").

---

## 2026-09-04 · feature · Trainee profile (pre-loaded particulars) built and verified live

**Kind:** feature
**Phase:** 1
**Commit / PR:** (pending — see below)

**What changed**
`/trainee/[id]` (previously a placeholder) now renders the real
"pre-loaded particulars" screen — a read-only port of the prototype's
`showProfile` (`reference/Tathmini.dc.html` lines 323–398): back link
to `/home`, "You are about to assess" eyebrow, trainee name, a track
chip/label row, a particulars card, and (new, using data the route
list already reads) a "Record locked" banner once `results.locked_at`
is set. Two new pure functions in `apps/web/src/lib/trainees.ts`:
`traineeParticulars()` (the row list, track-dependent) and
`trackPointsLabel()` (e.g. "TP · Theory 50 + Practical 50" / "IPT · 70
pts", summed live from `instruments.max_total` by instrument `code`,
never hardcoded).

**Why this way**
`showProfile` is bigger than what `ROADMAP.md`'s line names — it also
has a tap-to-notify-the-trainee panel (SMS/WhatsApp/e-mail via device
apps), a draft-in-progress banner, a "Start assessment" button, and a
"Request cross-route reassignment" flow. None of those were built:
notify needs a real send path (Phase 2, Beem/Brevo); the draft banner
needs Dexie/local persistence (later, unbuilt Phase 1 line); "Start
assessment" needs the marking-flow UI (the *next* unchecked Phase 1
line after this one — a button to nowhere if built now); reassignment
is Phase 3 Super Admin work. Scoped to exactly what the ROADMAP line
names, per `AGENTS.md`'s established pattern in this session of not
building ahead of what's asked.

The particulars list itself is a real, schema-driven departure from
`particularsFor()`, not a styling one: the prototype shows
`programme`/`ntaLevel`/`group`/`class`/`lessonTime` and (IPT)
`iptNo`/`industry`/`site`/`department`/`industrialSupervisor`/`weeks`/
`academicYear` — none of which exist in the real `trainees` table
(`packages/db/src/schema.ts`), because neither real September 2026
roster (TP or IPT) ever had those columns. Showing them would mean
inventing values, so the card only surfaces what's actually imported:
Registration No, Occupation, Course (+ mode of study when set),
VTC/Industry-Firm (`institution`, label switches on track), Region/
District, Email (TP) or Phone (IPT) — whichever the
`trainees_track_contact_check` CHECK constraint guarantees exists —
and "Assessed by" (the signed-in supervisor's own name + slot, from
their own `assignments` row for this trainee, not the prototype's
tap-to-notify button).

**Watch out for**
Postgres `numeric` columns (`instruments.max_total`) come back from
PostgREST/`supabase-js` as **strings**, not numbers — this codebase
had no prior precedent for reading a numeric column (the route list
only reads text/timestamp/uuid columns). Coerced with `Number(...)`
before use in `trackPointsLabel()`'s arithmetic; worth remembering for
any future query that touches a `numeric` column (`assessment_marks.
total`, `results.pct`/`gpa`, etc. will hit the same thing once the
marking flow is built).

The live IPT test trainees (migration `0011`) have `course = 'Test
Trade'` (same value as `occupation`) — not a bug in this page, just
what that migration's synthetic seed happened to insert; confirmed by
reading `0011`'s SQL directly rather than assuming a rendering bug.

This page now also enforces the `must_change_password` redirect
(previously it didn't — a direct link to `/trainee/[id]` bypassed the
gate `/home` enforces), for consistency with every other authenticated
page.

**Verified by**
`pnpm lint && pnpm test && pnpm typecheck` clean across all workspaces
(94 total Vitest cases: 27 shared + 47 db + 20 web, +7 new in
`apps/web` for `traineeParticulars()`/`trackPointsLabel()`); `pnpm
format:check` clean repo-wide. Full
browser flow against the real dev server, signed in as
`test.supervisor`: TP trainee (TEST TRAINEE 1) shows track chip "TP ·
Theory 50 + Practical 50", registration no `TEST-0001`, course `CAVT`
(no mode-of-study suffix, correctly), VTC `Test VTC`, region/district
`—`, email `test.trainee1@example.test`, "Assessed by Test Supervisor
(Assessor 1 of 2)", no locked banner. IPT trainee (TEST TRAINEE 4)
shows track chip "IPT · 70 pts", registration no `—`, Industry / Firm
`Test Company`, phone `0700000004`. Back link returns to `/home`. A
garbage id still renders "Not found" / "Back to route list", unchanged
from the placeholder's existing behaviour.

---

## 2026-09-04 · feature · Route list built and verified live: supervisor's real post-login landing screen

**Kind:** feature
**Phase:** 1
**Commit / PR:** (pending — see below)

**What changed**
`/home` now branches on `profile.role`: a `supervisor` gets a real route
list (`apps/web/src/app/home/route-list.tsx`), ported from the
prototype's `showList` screen (`reference/Tathmini.dc.html` lines
130–221) — header, tracker box (`N of M assessed`, %, progress bar),
3-way stat tiles (Assessed/In Progress/Not Started), a free-text search
box (name/occupation/institution/track/status), and the trainee card
list (avatar initials, track chip, status badge), each card linking to
a new placeholder `/trainee/[id]` page. `coordinator`/`super_admin`
still get the pre-existing generic placeholder, unchanged.

Status per trainee is derived (new, pure function in `apps/web/src/lib/
trainees.ts`, `deriveStatus`) from four RLS-scoped Supabase reads in
`/home/page.tsx`: `locked` once `results.locked_at` is set (already
computed server-side by `recompute_result()`); else `partial` once the
signed-in supervisor's own submitted `assessment_marks` count meets
their track's required-instrument count (read from `instruments`, not
hardcoded — TP: 2, IPT: 1 today); else `pending`. Migration `0011`
added one small synthetic `TEST ROUTE` (5 trainees, mixed TP/IPT)
assigned to the existing `test.supervisor` dev account, since it had
zero real trainees and I hold no real supervisor's password.

**Why this way**
`ROADMAP.md` said "status filters," but the prototype's `statusFilters`
pill row only exists on the coordinator's Phase 3 per-route drill-down
(`coShowRoute`) — the supervisor's actual `showList` screen has a
search box and nothing else. Built against the prototype's real
supervisor screen (the behavioural spec per `AGENTS.md`), not
`ROADMAP.md`'s shorthand for it. Two other deliberate departures from a
literal port, both because the real system differs from the
prototype's simplified fake one: the route summary line drops "stored
on this device" (Dexie/offline cache is unbuilt, separate `ROADMAP.md`
line — that line would be a lie today); and the 3-way tile split's
`inProgress` is hardcoded to `0` (it's driven by local draft state in
the prototype, which also doesn't exist yet) rather than reimplemented
against something that isn't real yet.

No marking-flow UI exists yet either (the very next unchecked
`ROADMAP.md` Phase 1 line) — so every real trainee correctly shows
`pending` today. That's expected, not a bug; `deriveStatus`'s
`locked`/`partial` branches are proven by unit tests
(`apps/web/src/lib/trainees.test.ts`) rather than left unverified until
marking exists.

**Watch out for**
Two environment gotchas hit during browser verification, neither an
app bug:
- A stale/zombie `next dev` process was still bound to port 3000 even
  after stopping its background task; the fresh dev server silently
  bound to port 3001 instead (`⚠ Port 3000 is in use, trying 3001
  instead.`). First sign-in attempt against `localhost:3000/login` hit
  the old process and silently did nothing. Always check the dev
  server's own log for the port it actually bound to, don't assume the
  default.
- A screenshot taken 2s after clicking Sign in timed out
  (`Page.captureScreenshot` timed out after 30000ms) — page had in fact
  already navigated; a retried, un-batched screenshot succeeded. Not a
  real hang, just a slow CDP round-trip during navigation.

The prototype's 3-way tile arithmetic (`notStarted = total - done -
inProgress`) means a `partial` trainee currently falls under "Not
started" in the tile count even though its own card badge would
correctly read "Awaiting 2nd assessor" — this is the prototype's own
existing behaviour, carried over deliberately, not a bug introduced
here. Revisit once `inProgress` is wired to real draft state.

**Verified by**
`pnpm lint && pnpm test && pnpm typecheck` clean across all workspaces
(87 total Vitest cases, +10 new for `trainees.ts`); `pnpm format:check`
clean repo-wide. Migration `0011` applied to `azlwxriyhdshfhklonrx`,
confirmed live: `TEST ROUTE` + 5 trainees (3 TP, 2 IPT) + 5 `a1`-slot
assignments to `test.supervisor`. Full browser flow against the real
dev server, signed in as `test.supervisor`: `/home` renders the route
list (not the old placeholder); header shows "MY ROUTE" / "TEST ROUTE"
/ "5 trainees · 2 centers"; tracker shows "0 of 5 trainees assessed" /
"0%" / "5 still to assess"; stat tiles read exactly `0` Assessed /
`0` In Progress / `5` Not Started; all 5 cards (confirmed via
`get_page_text`: Trainees 1–5) show "○ Not yet assessed" with correct
TP/IPT track chip colours; search for a name term ("trainee 5") narrows
to "1 of 5 shown" with the match highlighted; search for an occupation
term ("trade") narrows to "2 of 5 shown" (the two IPT trainees); tapping
a card navigates to `/trainee/<uuid>` and shows that trainee's real name
("TEST TRAINEE 4"), confirming the RLS-scoped id lookup works correctly.

---

## 2026-09-04 · migration · Phase 0 migrations 0000–0004 applied to the real Supabase project; pgTAP 18/18 verified live

**Kind:** migration
**Phase:** 0
**Commit / PR:** (pending — see below)

**What changed**
Applied `packages/db/migrations/0000_perfect_venom.sql` through
`0003_trainees_track_contact_check.sql` to the College's real Supabase
project (`azlwxriyhdshfhklonrx`, af-south-1) via the Supabase MCP
server's `apply_migration`, in order, after explicit user confirmation
this is the College's intended project, not a scratch one. Added a new
migration, `0004_fix_chain_audit_log_digest_schema.sql`, to fix a real
bug `chain_audit_log()`'s unqualified `digest(...)` call hit the first
time anything touched a real Supabase database. `packages/db/pgtap/
phase0.sql` (18 assertions, not the 15 recorded when it was first
written — see "Watch out for") was then re-run live and passed 18/18,
wrapped in the file's own `begin;...rollback;`, so nothing persisted.

**Why this way**
`ROADMAP.md` had explicitly deferred this ("no Supabase project exists
yet ... needs the College's/maintainer's account") — this was the first
time Phase 0's schema/RLS/functions touched a real database; everything
before this had only run against a throwaway local Postgres container.
`0001_rls_and_functions.sql` was left untouched rather than hand-edited
in place: once a migration is applied to a real project its file becomes
historical record, so the fix is a new migration (`0004`), the same
pattern `0002`/`0003` already used. The fix itself uses `set search_path
= public, extensions` on `chain_audit_log()` rather than hardcoding
`extensions.digest(...)`, so it resolves correctly both on Supabase
(pgcrypto lives in `extensions` there) and on the local Docker container
(pgcrypto installs into `public`, and `extensions` doesn't even exist
locally) — a nonexistent schema in `search_path` is not an error in
Postgres, so one function body now works unmodified in both places.

**Watch out for**
`ROADMAP.md` and this file's `0002`/`0003` entry below both say "15
assertions" / "15/15" — accurate when written; the suite grew to 18
(`select plan(18)`) when the three TP/IPT contact-channel assertions
were added alongside `0002`/`0003`, and the docs were never updated to
match. `ROADMAP.md` has been corrected; use 18 as the real count.

`chain_audit_log()` was the only place in `0001` calling a pgcrypto
function unqualified from inside a nested `SECURITY DEFINER SET
search_path = public` call — worth checking for the same pattern if more
pgcrypto calls get added later (`gen_random_uuid()` is safe regardless,
since it's also built into `pg_catalog` on Postgres 13+).

The Supabase MCP server's `apply_migration` tool was denied once by the
local permission classifier on the first attempt at `0001` — a
client-side block that fired before any DB call, not a Supabase error;
retrying the identical call after the user's approval succeeded cleanly.

Tables existed with RLS *not yet enabled* for the few minutes between
applying `0000` and `0001` — no data existed yet so nothing was exposed,
but the same sequencing against a project that already holds data would
need more care (single transaction, or a maintenance window).

The Supabase `execute_sql` tool returns only the *last* statement's
result set from a multi-statement script — running `phase0.sql` as-is
only surfaced assertion 18. Had to insert each assertion's output into a
temp table and `SELECT` it back as the final statement to see the full
`1..18` tally; worth remembering for any future ad hoc multi-statement
run against Supabase via this path.

**Verified by**
`packages/db/pgtap/phase0.sql` run live against `azlwxriyhdshfhklonrx`:
`1..18` plan line, 18 `ok` lines, 0 `not ok`. Confirmed no residual rows
afterward (`select count(*) from users/trainees/audit_log/results` all
`0`).

---

## 2026-09-04 · migration · TP Theory and IPT criteria seeded into the real Supabase project

**Kind:** migration
**Phase:** 0
**Commit / PR:** (pending — see below)

**What changed**
Inserted the `instruments`/`criteria` rows for `tp_theory` (41 items, 10
sections, max 50) and `ipt` (14 items, 6 sections, max 70) into
`azlwxriyhdshfhklonrx`, straight from `packages/db/src/seed/
criteria.ts`'s `TP_THEORY_CRITERIA`/`IPT_CRITERIA` arrays (`order_index`
assigned from each array's position, matching document order). TP
Practical remains unseeded — still blocked on the same numbering defects
recorded below.

**Why this way**
No seed-runner script existed yet (`import-trainees.ts` explicitly only
validates, doesn't write; there was no equivalent for criteria). Rather
than build a new script's plumbing (DATABASE_URL, drizzle client) for a
one-time reference-data load I don't have credentials for anyway, the
insert went straight through the Supabase MCP `execute_sql`, wrapped in
one transaction so `validate_instrument_maxima()` (0001's statement-level
trigger) checked both instruments' section sums atomically before
either committed.

**Watch out for**
This was a direct data load, not a tracked migration file — the
`instruments`/`criteria` rows exist live but there's no corresponding
`packages/db/migrations/000N_*.sql` to replay them on a fresh database
or in the local Docker workflow. If TP Practical's numbering gets
resolved and prompts building a real seed script, it should probably
seed TP Theory and IPT too, so all three go through the same reproducible
path instead of leaving this one as a live-only exception.

**Verified by**
Queried `azlwxriyhdshfhklonrx` directly after insert: `tp_theory` — 41
criteria rows, `order_index` 1..41 with no duplicates, distinct section
maxima summing to 50 (matches `instruments.max_total`); `ipt` — 14 rows,
`order_index` 1..14, section maxima summing to 70. Both match the
existing `packages/db/src/seed/criteria.test.ts` vitest assertions
exactly (41/10 and 14/6 respectively).

---

## 2026-09-04 · migration · Criteria seed turned into a tracked, idempotent migration (0005)

**Kind:** migration
**Phase:** 0
**Commit / PR:** (pending — see below)

**What changed**
The prior entry's live seed of TP Theory/IPT criteria was a one-off
`execute_sql` data load with no corresponding migration file — flagged
there as a gap. Closed it: `packages/db/migrations/
0005_seed_tp_theory_ipt_criteria.sql` now holds the same insert, guarded
with `where not exists (...)` on both the `instruments` and `criteria`
inserts so it's a no-op on a database that already has the rows.

**Why this way**
The guard exists specifically so applying this migration to
`azlwxriyhdshfhklonrx` — which already had the data from the prior ad hoc
load — wouldn't create a second `tp_theory`/`ipt` instrument (nothing
uniquely constrains `instruments.code`, so a naive re-insert would have
silently duplicated both instruments and broken `recompute_result()`'s
`where i.code = 'tp_theory'` lookups). Same file now also replays
correctly on an empty database (local Docker, CI, or a future fresh
project), since `NOT EXISTS` is trivially true there.

**Watch out for**
`instruments.code` has no unique constraint at the schema level — this
migration's `NOT EXISTS` guard is the only thing preventing a duplicate
`tp_theory`/`ipt` row if it or a similar seed is ever run outside this
exact migration path. Worth a real unique constraint if more seed
migrations get added later.

**Verified by**
Applied `0005` to `azlwxriyhdshfhklonrx` via `apply_migration`, then
queried: exactly 2 rows in `instruments` total (one `tp_theory`, one
`ipt`), criteria counts unchanged at 41/14 — confirms the guard actually
skipped the re-insert rather than erroring past it.

---

## 2026-09-04 · migration · TP roster imported live: 17 new accounts, 9 routes, 364 trainees, 728 assignments

**Kind:** migration
**Phase:** 0/1
**Commit / PR:** (pending — see below)

**What changed**
User ran `create:accounts` again (covers both rosters now) — 13 existing
accounts correctly skipped, 17 new ones created. Built
`packages/db/src/scripts/generate-tp-import-sql.ts` (+ tests) rather than
hand-transcribing the migration like the IPT one: 364 rows was judged too
large to safely hand-copy (the 118-row IPT migration already needed a
mid-session correction from a manual mislabeling). The generator produces
the exact SQL from the parsed, validated roster data. Applied as
`packages/db/migrations/0008_import_tp_roster_data.sql`.

While generating it, running the real parser (fixed earlier this session
— see the "IPT roster parser" entry below for the hyperlink-cell bug)
surfaced a defect worse than IPT's: **the first apply attempt failed
outright**, `23505` on `trainees_registration_number_unique`. Rafael and
Raphael Pato Mohele (TP Route 2) share `MVTTC/CAVT/2025/0128`, and
unlike IPT's phone-sharing duplicates (no equivalent constraint exists
there), `registration_number` has a hard database-level UNIQUE
constraint — the "for now, import as-is" policy from the IPT roster
literally cannot apply here; the database will not allow it. Confirmed
the failed attempt rolled back completely (0 rows written) before
asking the user how to resolve it.

User's decision: keep both trainee rows (different institutions/e-mails
suggest possibly different people), first occurrence keeps the real
registration number, later occurrence(s) get `null` rather than an
invented number. Implemented as `dedupeRegistrationNumbers()` in
`generate-tp-import-sql.ts` — a general rule (first-occurrence-wins,
not a one-off hand-edit), covered by its own tests, applied automatically
by the generator rather than patched into the SQL by hand.

**Why this way**
Same reasoning as the IPT account-creation script: the generator needs
no secrets (only reads the local roster file), so I can run it myself,
review the output, and apply it through the same Supabase MCP path as
every migration so far — nothing about roster-to-SQL transcription was
trusted to manual copying this time.

**Watch out for**
`trainees.registration_number`'s UNIQUE constraint is a real, sharp edge
for any *future* roster import too — a repeat of this exact failure mode
should be expected if the College ever sends a roster with its own
internal duplicate. `dedupeRegistrationNumbers()` in
`generate-tp-import-sql.ts` is written generically (keyed only on
`registrationNumber`, not this specific pair) so it already handles that
case if it recurs, but it's IPT/TP-parser-specific — a future third
roster format would need the same treatment applied deliberately, not
assumed.

The user again pasted the full `create:accounts` output including the
one-time password table into chat (second time — see the IPT entry
below for the first). Same guidance repeated: treat those 17 as exposed,
reset before real use.

**Verified by**
`pnpm --filter @tathmini/db test` — 47/47 (37 existing + 10 new), `lint`
and `typecheck` clean. Queried `azlwxriyhdshfhklonrx` after applying
`0008`: 30 total accounts (13 + 17), 9 `TP ROUTE *` routes, 364 TP
trainees, 728 assignments. Confirmed Route 6 resolves to
`denis.michael`/`adam.msofe.supervisor` (not a second Adam Msofe
account), and Rafael/Raphael Pato Mohele are both present — Rafael with
the real registration number, Raphael's `null`, exactly as decided.

---

## 2026-09-04 · feature · IPT roster parser built; roster still not clean enough to import

**Kind:** feature
**Phase:** 0 (prep for Phase 1's real data, not on the ROADMAP checklist itself)
**Commit / PR:** (pending — see below)

**What changed**
User pointed at what they called an "updated" IPT assessment document
(`IPT ASSESSMENT SEPTEMBER  2026.xls`, same filename as the one referenced
in the "IPT notices are SMS-only" entry below) and asked to make changes
accordingly. Read it (legacy binary `.xls` — `xlrd` in Python first to
inspect, then `xlsx`/SheetJS added as a new `packages/db` dependency for
the actual TypeScript parser, since `ExcelJS` doesn't read `.xls`). It is
**not** a criteria/rubric document — 4 of its 5 sheets are unrelated
College payroll/logistics budgets for a different process (semester
module exam invigilation/marking/moderation allowances). Only sheet 1,
`SETTING AND MODERATION JAN 2026` (misleadingly named), holds the actual
IPT route/assessor/trainee roster.

Built `packages/db/src/scripts/import-ipt-roster.ts` (+ test), a sibling
to `import-trainees.ts` for the TP roster — not a shared parser, the two
source shapes differ too much (no registration number or e-mail column
here; route/assessor header is one free-text cell per route, not two
separate columns; format itself is inconsistent — "ROUT"/"ROUTE",
"NO. 1"/"NO 3."). Parses and validates only; writes nothing to any
database.

**Why this way**
The prior entry below already flagged this exact file's two open
questions (no registration number; specific duplicate trainees) and said
explicitly not to treat the schema change there as "the IPT roster is now
importable." I checked this "updated" copy against both — **neither is
resolved**. Given AGENTS.md's stop-and-ask rules (any DB migration;
anything touching auth/roles — creating the 10 assessor accounts would be
both) and that this exact data was already flagged once, building the
parser/validator (safe, testable, no live effect) and re-surfacing the
same questions is the right increment, not writing to
`azlwxriyhdshfhklonrx` on the strength of "the file changed."

**Watch out for**
Running the parser against the real file (`IPT_ROSTER_PATH=...`) found:
**118 trainees, 5 routes, 10 assessors**, and 4 `duplicate_phone` issues —
the same substantive problems as before, precisely reproduced:
- Same trainee entered under two routes (same name, same phone): "Adeni
  Mwanitu" (Route 2 and Route 4), "Heri Ayubu" (Route 2 and Route 4).
- Two different trainees sharing one phone number each: Philomena Kuzenza
  (Route 1) / Hemedi Hemedi (Route 5); Joshua Izack (Route 1) / Alex Nziku
  (Route 3) — two different people's results would currently reach the
  same number.

New wrinkle, not previously noted: one of the 10 IPT assessors is **"Aron
Franco"** (Route 2) — the same name already seeded as a `super_admin`
account in the prototype's fake `ACCOUNTS` array (maintainer role). Not
resolved here; whoever builds real account creation needs to know if
that's the same person wearing two hats or a name collision, since
`users.role` is one enum column, not a set.

Also fixed, while here: `import.meta.url === \`file://${process.argv[1]}\``
(the CLI-entry-point guard both this script and `import-trainees.ts` use)
never matches on Windows — `import.meta.url` is `file:///C:/...`,
`process.argv[1]` is `C:\...`, naive string concatenation never produces
a match, so `main()` silently never ran via `pnpm run import:*` on this
platform. Fixed both with `pathToFileURL(process.argv[1]).href`, which
normalizes correctly cross-platform. This is how the "118 trainees..."
output above was actually obtained — before the fix, the script produced
zero output and exit code 0, which would have looked like nothing was
wrong.

**Verified by**
`pnpm --filter @tathmini/db test` — 23/23 (18 existing + 5 new), `lint`
and `typecheck` clean. Ran the real CLI against the real file (see
"Watch out for" above) — output matches what hand-checking the extracted
sheet data predicted, once one manual mislabeling on my part (calling two
of the duplicate rows "Route 2" instead of the correct "Route 1", from
misreading which route-header block they fell under) was corrected by
trusting the code's own boundary-tracking over my own eyeballing.

---

## 2026-09-04 · decision · TP Practical numbering defects resolved; criteria seeded (all three instruments now complete)

**Kind:** decision
**Phase:** 0
**Commit / PR:** (pending — see below)

**What changed**
User supplied a corrected source document, `Fomu ya Assessment
TP_Practical Final.docx` (outside the repo, under `resources/form-
samples/`), superseding the earlier scanned `.txt`. Extracted its tables
(docx is a zip of XML; `word/document.xml`'s `<w:tbl>`/`<w:tr>`/`<w:tc>`/
`<w:t>` structure parsed directly — no docx library available, wrote a
one-off Node script instead). Of the two defects flagged earlier: the
missing section-5 number is fixed in the new source ("PERSONALITY
ATRIBUTIES" [sic] is now explicitly "5"); the section-2 duplicate "vii."
is **not** fixed in the source — still literally there — but the user
confirmed (this session) that the second "vii." ("Practical performance
intergraded with knowledge thought oral questioning") should be treated
as "viii.".

Added `TP_PRACTICAL_CRITERIA`/`TP_PRACTICAL_MAX_TOTAL` to `packages/db/
src/seed/criteria.ts` (34 items, 5 sections, max 50), matching tests in
`criteria.test.ts` (including one asserting section 2's item codes run
`i`..`x` with no duplicates). `reference/forms/TP Practical form.txt`
rewritten to match the corrected `.docx` — including the still-present
"vii."/"vii." duplicate, transcribed exactly as the source has it, with
a note at the bottom of the file recording both the fix and the
non-fix and pointing here. Seeded live via a new idempotent migration,
`packages/db/migrations/0006_seed_tp_practical_criteria.sql` (same
`NOT EXISTS` guard pattern as `0005`).

**Why this way**
The `vii.`/`viii.` correction is applied only in `criteria.ts`'s
`itemCode` (a code/key, not the verbatim wording) and in the seed
migration — never in `reference/forms/TP Practical form.txt`, which
stays a literal transcription of what the actual source document says.
This keeps the "verbatim from reference/forms/" rule meaningful: the
reference file is provably faithful to the source, and the one place we
deviate from it is called out explicitly, with the user's approval
recorded, rather than silently baked into the "verbatim" file itself.

**Watch out for**
Two more things noticed in the corrected `.docx`, not raised as
blockers because they don't affect item structure or arithmetic:
section 4 item i's label has an unclosed parenthesis in the source
("...appropriateness" with no closing ")") — transcribed verbatim,
unclosed, same as everything else here; and section 3 item iii says
"knowledge **though** oral questioning" while section 2 item viii says
"knowledge **thought** oral questioning" — two different words in two
similar-sounding items, both transcribed exactly as each one
individually reads, not harmonized to match each other.

**Verified by**
`pnpm --filter @tathmini/db test` — 18/18 (up from 15/15; the 3 new
tests are TP Practical's `checkInstrument` trio), `lint`, `typecheck`
all clean. Applied `0006` to `azlwxriyhdshfhklonrx`; queried live: all
three instruments now present — `tp_theory` 41 items/50, `tp_practical`
34 items/50, `ipt` 14 items/70 — each instrument's distinct section
maxima summing to its `max_total`.

---

## 2026-09-04 · feature · Phase 1 auth built and verified live: sign-in, forced password change, session cookies

**Kind:** feature
**Phase:** 1
**Commit / PR:** (pending — see below)

**What changed**
`apps/web` went from a bare `create-next-app` scaffold to a working
auth flow against the real Supabase project: `@supabase/ssr` +
`@supabase/supabase-js` added; `lib/supabase/{client,server}.ts`;
`lib/auth.ts` (`usernameToEmail`, the exact prototype error copy);
`middleware.ts` (session refresh + redirect-to-`/login` gate);
`/login` (copy/palette from `reference/Tathmini.dc.html` lines 92–128);
`/change-password` (new — no prototype precedent); `/home` (one
generic authenticated placeholder, deliberately not role-specific —
real route list / coordinator dashboard is separate `ROADMAP.md` work).
Migration `0009` added `users.must_change_password` (default `true`,
backfilled to all 30 already-live accounts) and
`clear_own_password_change_flag()`, a `SECURITY DEFINER` RPC in the
same style as `current_app_role()`/`is_coordinator()` (0001) — existing
`users` RLS gives no role an `UPDATE` grant on their own row, so this
is the narrow, Postgres-side way a signed-in user clears their own
flag, per AGENTS.md rule 1.

**Why this way**
Verification needed a real login I could actually test with — I hold
none of the 30 real accounts' passwords (by design, never recorded).
Added one synthetic `test.supervisor` dev account
(`packages/db/src/data/dev-accounts.ts`, folded into `create-accounts.ts`'s
`ALL_ACCOUNTS`) instead of testing against a real person's credentials.

**Watch out for**
`create-accounts.ts` only ever created the Auth identity
(`auth.users`) — it explicitly does not touch the `users` table by
design (see its own docstring). I forgot this applies to *every* new
account added there, including `test.supervisor`, and initially left it
unlinked — caught only because `must_change_password` came back `NULL`
(no row) when I went to verify. Fixed with migration `0010`, same
`NOT EXISTS`-guarded linking pattern as `0007`/`0008`. **Any future
addition to `ipt-accounts.ts`/`tp-accounts.ts`/`dev-accounts.ts` needs
its own linking migration too** — `create-accounts.ts` alone is never
sufficient.

Separately, a real browser-automation mistake during verification, not
an app bug: after the first (deliberately wrong-password) submit added
an error banner, the page layout shifted and the viewport itself
resized between screenshots — a second click reusing the first
screenshot's button coordinates missed the button entirely. The dev
server's request log (only one `POST /login` where I expected two) is
what caught it — a raw Supabase Auth REST call with the same
credentials succeeded immediately, proving the credentials and the
server action were both fine and the miss was purely a stale-coordinate
click. Re-verified using `find` + element refs instead of remembered
pixel coordinates; worth defaulting to that over coordinates whenever a
page's layout can shift between screenshots (an error banner appearing,
a pending/loading state, etc.).

**Verified by**
`pnpm --filter @tathmini/db test`/`lint`/`typecheck` and
`pnpm --filter @tathmini/web test`/`lint`/`typecheck` all clean;
`pnpm format:check` clean repo-wide. Live migration `0009` confirmed:
column exists, all 30 existing rows `must_change_password = true`,
function is `SECURITY DEFINER`. Full browser flow driven end-to-end
against the real dev server: wrong password → exact prototype error
copy; correct password (first login) → `/change-password`; new
password saved → `/home`, `must_change_password` confirmed `false` live;
session cookie survives a hard refresh; sign out → `/login`; sign back
in with the new password → straight to `/home`, no forced change.

---

## 2026-09-04 · migration · IPT roster imported live: 13 users, 5 routes, 118 trainees, 236 assignments

**Kind:** migration
**Phase:** 0/1
**Commit / PR:** (pending — see below)

**What changed**
User ran `create-accounts.ts` themselves against `azlwxriyhdshfhklonrx`
with their own `SUPABASE_SERVICE_ROLE_KEY` (after one setup hiccup — see
"Watch out for") — all 13 real Auth accounts created successfully.
Applied `packages/db/migrations/0007_import_ipt_roster_data.sql`: links
those 13 Auth accounts into `users`, creates the 5 `routes`, imports the
118 `trainees` from the September 2026 IPT roster, and creates the 236
`assignments` (each trainee × both their route's assessors). Trainees
went in **as-is** — the known duplicates (Adeni Mwanitu, Heri Ayubu on
two routes each; Philomena Kuzenza/Hemedi Hemedi and Joshua Izack/Alex
Nziku sharing one phone number each) are all present, untouched, per the
user's explicit "for now" instruction. Nothing deduplicated or merged.

**Why this way**
Two data-mapping calls made without a matching source column (verbatim
roster only has SN/NAME/SEX/TRADE/REGIONAL/DISTRICT/COMPANY/PHONE NO):
`trainees.course` (`NOT NULL`) set to `'TC-TVTE'` for every row — the
short code CONTEXT.md's glossary already uses for "the teacher-education
programme trainees are enrolled in," matching the TP roster's short-code
style (`'CAVT'`) rather than the workbook's full descriptive header
text. The roster's `SEX` column has no home in `trainees` (no such
column) and was not imported. Both flagged to the user, not silently
decided as permanent.

**Watch out for**
Setting the environment variables for `create-accounts.ts` failed once:
the user initially set `NEXT_PUBLIC_SUPABASE_URL` to the **REST API**
URL (`https://azlwxriyhdshfhklonrx.supabase.co/rest/v1/`) instead of the
plain project URL — every account creation call failed identically with
"Invalid path specified in request URL" (a Kong gateway error from the
Admin Auth API receiving a doubly-nested path). Diagnosed by asking the
user to echo the env var back (safe — it's not a secret) rather than
guessing. Worth a note in `create-accounts.ts` or its own doc comment if
this trips someone else up again.

Separately: the user pasted the **full** script output back into chat,
including the one-time password table, despite being asked for just the
`Results:` status lines. Those 13 passwords are now in this conversation
transcript and should be treated as exposed — flagged directly to the
user; recommended resetting each via the Supabase dashboard before
actually handing accounts to the real people, rather than trusting the
originally generated ones.

**Verified by**
Queried `azlwxriyhdshfhklonrx` directly: exactly 13 users (matching
`ipt-accounts.ts`), 5 routes, 118 trainees, 236 assignments. Confirmed
Route 2's `supervisor_a1_id` resolves to `aron.franco.supervisor`, not
his `aron.franco` super_admin account. Confirmed all 4 known
duplicate-phone pairs present as separate rows on their original
distinct routes, unchanged — the import faithfully reproduced the
source's real defects rather than silently cleaning them.

---

## 2026-09-04 · decision · Real account creation designed: synthetic-email identity, dual accounts for dual-role people

**Kind:** decision
**Phase:** 0/1 (account creation is prep work; the underlying auth
identity scheme decided here belongs to Phase 1)
**Commit / PR:** (pending — see below)

**What changed**
User confirmed Aron Franco (IPT Route 2 assessor) and Adam Msofe
(confirmed via `TEACHING PRACTICE TRAINEES SEPTEMBER 2026.xlsx`: TP
Route 6, paired with Denis Michael) are each dual-role — supervisor and
super_admin — and want two separate accounts per person, not one account
with two roles (`users.role` is a single enum column, can't hold both).

Building the account-creation script surfaced a real, previously
undecided architecture question: Supabase Auth needs an email (or phone)
per account, but Tathmini's whole design (CONTEXT.md, the prototype) is
**username** (`firstname.lastname`) + password login, and none of the 10
real IPT assessors have an e-mail on file (only trainees do, and only on
the *TP* roster — a different document). User decided: **synthetic
internal e-mail per account**, `firstname.lastname@tathmini.internal`,
used only as Supabase Auth's required identifier, never a real inbox —
`account()` in `packages/db/src/data/ipt-accounts.ts`.

Built:
- `packages/db/src/data/ipt-accounts.ts` — the 13 real accounts this
  round covers (see below for why 13, not 14). No passwords, ever.
- `packages/db/src/scripts/create-accounts.ts` (+ test) — calls the
  Supabase Auth Admin API (`@supabase/supabase-js`, new dependency,
  server-only) per account, generates a random 16-char password per
  account, prints a one-time `username | password` table to stdout only,
  skips (doesn't error) an account whose synthetic e-mail is already
  registered.
- `ROADMAP.md` Phase 3's "Route management" line now explicitly calls
  out manual trainee-to-route (re)assignment — the user's answer to the
  known duplicate-trainee defects (see the "IPT notices are SMS-only"
  entry below) is to accept the roster as-is for now and add a Super
  Admin tool to fix cases like it by hand. Checked: the DB/RLS layer
  already supports this with no changes (`trainees_admin_write` grants
  `super_admin` `UPDATE` on `trainees`, never `REVOKE`d) — only the UI is
  missing, and there's no admin app shell yet to hang one on, so this is
  recorded as a Phase 3 requirement rather than built now.

**Why this way**
No Supabase service-role key or MCP tool exists to create real Auth
accounts from this session (`.env.example` didn't have the key; the
Supabase MCP server's tools are all Postgres/project-management, none of
them Auth Admin API) — confirmed before proposing anything, per AGENTS.md
"anything touching auth" being a stop-and-ask item regardless. User chose
to run `create-accounts.ts` themselves with their own key rather than
hand it to an agent — the script is written so that's a clean split: it
only touches Auth (the part that needs the key), not `packages/db`'s own
`users`/`routes`/`trainees`/`assignments` tables (a separate step, once
these accounts exist, that I run myself via the Supabase MCP the same way
the criteria seed migrations were applied).

The `.supervisor` username suffix is applied to **both** dual-role
people's second account uniformly (`adam.msofe.supervisor`,
`aron.franco.supervisor`), not just where the bare username would
collide with an existing one — a predictable rule a future Super Admin
tool can reapply, rather than an ad hoc fix per person.

**Watch out for**
**Arithmetic correction, mid-session:** first said "14 accounts" (2
super_admin + 12 supervisor) in the plan; actually 13. The 10 IPT
route-assessor slots (2 per route × 5 routes) already *include*
`aron.franco.supervisor` as the Route 2 slot — it is not an 11th account
on top of those 10. Only Adam Msofe's supervisor account is genuinely
outside the 10 (he's on the TP roster, not IPT). `create-accounts.test.ts`
caught this via `toHaveLength(14)` actually failing against 13 real
entries — the data file itself was always correct; only the prose/test
expectation were wrong. Worth remembering when reasoning about roster
counts generally: "N routes × 2 assessors" and "count of distinct
people" are not the same number the moment anyone is dual-role.

This round of account creation deliberately does **not** cover: the
other 16 TP-roster supervisors (routes 1,2,3,4,5,7,8,9), any TP trainee
import, or a Coordinator account (no real name confirmed for that role
anywhere yet). Only what was actually asked about.

No forced-password-change-on-first-use flow exists yet (`ROADMAP.md`
Phase 1, confirmed absent from the prototype too — see the Phase 1 auth
research below). The one-time printed password from `create-accounts.ts`
is a stand-in until that's built, not a replacement for it.

**Verified by**
`pnpm --filter @tathmini/db test` — 32/32 (23 existing + 9 new), `lint`
and `typecheck` clean. `create-accounts.ts` itself not yet run against
the real project — that's the user's step, with their own
`SUPABASE_SERVICE_ROLE_KEY`; the `users`/`routes`/`trainees`/
`assignments` import (migration `0007`, per the approved plan) follows
once they confirm it succeeded.

---

## 2026-09-04 · decision · IPT notices are SMS-only, never e-mail; trainees.email/phone made track-dependent

**Kind:** decision
**Phase:** 0
**Commit / PR:** (pending — see below)

**What changed**
User supplied a real IPT route/assessor/trainee document
("IPT ASSESSMENT SEPTEMBER 2026.xls") and stated the rule directly: IPT
trainees get SMS feedback only, not e-mail. Updated `CONTEXT.md`'s
"Trainee accounts?" decision row to say so explicitly (previously it
only said "e-mail only," inherited unchanged from the TP-only prototype
era).

Schema change (`packages/db/src/schema.ts`, migrations `0002`/`0003`):
`trainees.registration_number` and `trainees.email` are now nullable;
added `trainees.phone` (nullable); added a CHECK constraint,
`trainees_track_contact_check`, requiring `email` for `track = 'TP'` and
`phone` for `track = 'IPT'`. `packages/db/pgtap/phase0.sql` grew three
assertions proving it (IPT-no-phone rejected, TP-no-email rejected,
IPT-with-phone-no-email accepted) — plan 15 → 18, all passing, verified
the same way as the rest of the suite (fresh local Postgres 16 + real
pgTAP, not the stub).

**Why this way**
Not an arbitrary product rule — a fact about what the College's own
registers actually capture. The September 2026 TP roster
(`TEACHING PRACTICE TRAINEES SEPTEMBER 2026.xlsx`) has an e-mail column
and no phone column; the IPT document has a phone column (`PHONE NO`)
and no e-mail column at all, across all 118 trainees in it. A schema
that required both, or that let the UI silently offer an e-mail option
for IPT trainees, would be offering a channel the College has no data
to support — the CHECK constraint makes that unrepresentable rather than
relying on the UI to enforce it (AGENTS.md rule 1: authorisation/
validity lives in Postgres, not a client condition).

**Watch out for**
The IPT document is genuinely messier than the TP one and raises two
open questions that are **not** resolved by this entry — do not treat
this schema change as "the IPT roster is now importable":

1. **No registration number at all.** The IPT sheet (tab misleadingly
   named "SETTING AND MODERATION JAN 2026," inside a workbook titled
   "IPT ASSESSMENT SEPTEMBER 2026.xls" that is mostly unrelated
   staff-payment/logistics sheets — invigilation, marking, setting and
   moderation allowances) has columns SN/NAME/SEX/TRADE/REGIONAL/
   DISTRICT/COMPANY/PHONE NO. No registration number, even though the
   printed IPT form itself has a "Registration/Index No." field. This
   looks like a route/assessor planning sheet, not the full official
   IPT register — asked the user whether a fuller register exists.
2. **Real duplicate/data-quality issues**, same pattern as the TP
   roster: "Adeni Mwanitu" and "Heri Ayubu" each appear in two different
   routes (Route 2 and Route 4) with the same name and the same phone
   number — almost certainly the same trainee entered twice. Separately,
   two pairs of *different* trainees share a phone number each
   (Philomena Kuzenza/Hemedi Hemedi on 783944072; Joshua Izack/Alex
   Nziku on 617892997) — data-entry error or a shared household phone,
   but either way two different trainees' results would currently
   reach the same number.

`import-trainees.ts` does **not** yet parse the IPT format — its column
layout, route-header text ("ROUT NO. 1 ... ASSESSORS: X & Y" all in one
cell, inconsistent as "ROUT"/"ROUTE", "NO. 1"/"NO 3.") and the missing
registration number all differ enough from the TP format that extending
the parser before the two questions above are answered risks building
against the wrong shape twice.

**Verified by**
Fresh local Postgres 16 + real pgTAP: all four migrations (`0000`–
`0003`) apply cleanly in order; 18/18 pgTAP assertions pass, including
the three new ones. `pnpm typecheck` clean.

---

## 2026-09-04 · ops · Operations-baseline docs: README, packages/db/README, .env.example

**Kind:** ops
**Phase:** 0
**Commit / PR:** (pending — see below)

**What changed**
Root `README.md` (human quickstart — stack, layout, prerequisites,
`pnpm install && pnpm dev`, pointers to `AGENTS.md`/`CONTEXT.md`/
`ROADMAP.md` for the "why"). `packages/db/README.md` documents the exact
local-Postgres workflow this session built and used to verify the schema
and pgTAP suite without a Supabase project — applying migrations,
running pgTAP, changing the schema, importing the roster. `.env.example`
lists the two environment variables actually read by code today
(`DATABASE_URL`, `TRAINEE_REGISTER_PATH`) plus commented-out Supabase/
Sentry placeholders for Phase 0.5, none of which are wired up yet.

**Why this way**
`ROADMAP.md` Phase 0 names "Supabase CLI local dev + migration workflow
documented" as an exit-relevant task; the Supabase-project half of that
needs an account only the user can provide, but the Postgres-level half
(how to apply the migrations, run pgTAP, without any Supabase project at
all) was already fully worked out and verified in the previous session
and was undocumented anywhere but this file's own entries — worth
writing down properly rather than leaving it to be re-derived.

**Watch out for**
`packages/db/README.md`'s commands were re-verified end to end against a
fresh container while writing this entry, not just carried over from
memory — the first draft actually had two real mistakes: `docker cp`'s
destination doesn't need the `//tmp/` MSYS escape (only bare `docker exec
... -f /tmp/x` does; `docker cp`'s `container:/tmp/x` argument doesn't
start with `/` so MSYS leaves it alone), and `docker exec container ls
/tmp/x` used as a verification step is *itself* broken by the same
mangling — don't trust a first pass at documenting a workaround for a
path-mangling bug without re-running it fresh afterward.

**Verified by**
Fresh `docker run` → apply auth stub → apply both migrations → install
pgtap → run `pgtap/phase0.sql`, using the exact commands now in
`packages/db/README.md`, all 15 assertions passing. `pnpm lint && pnpm
test && pnpm typecheck` clean.

---

## 2026-09-04 · bugfix · pgTAP suite's throws_ok calls were checking the wrong thing; CI wasn't failing on assertion failures

**Kind:** bugfix
**Phase:** 0
**Commit / PR:** [#2](https://github.com/MsofeCoder/tathmini/pull/2)

**What changed**
Two bugs, both found by finally running the pgTAP job in real GitHub
Actions (the previous entry below only had this dry-run against stub
pgTAP functions, since the real extension isn't installable offline).
The job reported "pass" while its own log said "Looks like you failed 9
tests of 15" — the CI job wasn't failing the build, and 9 of the 15
`throws_ok(sql, errcode, description)` calls were failing for real.

Fixed `packages/db/pgtap/phase0.sql` — every `throws_ok` now uses the
4-arg form `throws_ok(sql, errcode, null, description)`. Fixed
`.github/workflows/ci.yml`'s pgtap job to `tee` the suite's output and
`grep` it for `^not ok`, failing the step explicitly if found.

**Why this way**
The installed pgTAP's 3-arg `throws_ok` is `(sql, errcode, errmsg)` —
the third argument is matched against the raised error's *message text*,
not used as a free-text test label. Every one of the 9 failing
assertions had the exactly correct SQLSTATE (confirmed in the job log's
`caught:`/`wanted:` diagnostic — both showed the same code) but failed
because my description text didn't literally match the database's real
error message. Passing `null` for `errmsg` skips that comparison and
checks only the SQLSTATE, which is what every one of these assertions
actually needs to verify.

Separately: pgTAP's assertion functions (`throws_ok`, `is`, etc.) never
raise an uncaught SQL exception on failure — they catch internally and
return a text summary. `psql -f suite.sql` therefore exits 0 regardless
of how many assertions failed; only `finish()`'s printed tally reflects
the truth. A CI job that just runs `psql -f ...` and trusts its exit
code will report "pass" on a suite that is silently, completely broken.
This is not specific to this project's suite — it is true of *any*
pgTAP suite run this way, so the `tee`-and-`grep` pattern (or `pg_prove`,
which does parse TAP output honestly) is required, not optional.

**Watch out for**
If a future `throws_ok` call is added without the explicit `null` in the
3rd position, it will silently fail exactly like this — the type
signature doesn't distinguish "errmsg" from "description" for a human
skimming the call, only position does. Consider a project convention
(or a lint/grep check) requiring 4-arg `throws_ok` everywhere.

**Verified by**
Real GitHub Actions run on PR #2 (`gh pr checks 2`), before and after:
before, `pgtap` job showed "pass" with the log containing "failed 9
tests of 15"; after, re-verify that the job both shows "pass" *and* the
log shows "All 15 subtests passed" / no `not ok` lines.

---

## 2026-09-04 · migration · Phase 0 schema, RLS, triggers and pgTAP suite (not yet applied to any database)

**Kind:** migration
**Phase:** 0
**Commit / PR:** (pending — see below)

**What changed**
`packages/db/src/schema.ts` now defines all 13 tables (the 11 from
ROADMAP.md plus `routes` and `assessment_mark_items` — see "Why this way"),
generated as `packages/db/migrations/0000_perfect_venom.sql`. A
hand-written companion migration, `0001_rls_and_functions.sql`, adds: the
`users` → `auth.users` FK; `veta_pct`/`veta_grade`/`veta_gpa`/
`veta_class_of_award` (IMMUTABLE SQL functions mirroring
`packages/shared/src/grading.ts` exactly); role/assignment helper
functions; a trigger that rejects `criteria` whose section maxima don't
sum to the instrument's `max_total`; a trigger that rejects an incomplete
`assessment_mark_items` submission and finalizes a complete one
(stamping `total`/`submitted_at`); a trigger that recomputes `results`
(average of submitted slots, to one decimal, with grade/GPA/class/verdict)
whenever a mark is finalized; an audit-log hash chain; RLS policies
(default deny) on every table; and `REVOKE UPDATE/DELETE` on
`assessment_marks`/`assessment_mark_items` and `DELETE` on `audit_log` as
a grant-level backstop alongside the RLS policies.

`packages/db/pgtap/phase0.sql` is the exit-gate suite named in PLAN.md
0.2/0.3 (15 assertions). `packages/db/src/seed/criteria.ts` seeds TP
Theory and IPT (verified against the verbatim forms by
`criteria.test.ts`'s arithmetic checks). `packages/db/src/scripts/
import-trainees.ts` parses and validates the College's roster spreadsheet
(route/supervisor-pair/trainee rows) without writing to any database yet.

**Why this way**
Two tables beyond ROADMAP.md's eleven:
- `routes` — the real September 2026 TP roster (supplied by the user,
  `TEACHING PRACTICE TRAINEES SEPTEMBER 2026.xlsx`) showed a route is a
  named, standing thing with two fixed supervisors assigned before any
  trainee exists (9 routes, each with exactly 2 named supervisors,
  364 trainees total) — not something derivable from `assignments`
  alone. Confirmed with the user before writing the schema.
  `assignments` stays the RLS/reassignment source of truth at trainee
  granularity (seeded by expanding each route's pair across its
  trainees, then mutable per-trainee for reassignment); `routes` is the
  seed template and the Phase 3 admin surface.
- `assessment_mark_items` — a per-criterion child table rather than a
  jsonb blob on `assessment_marks`, so the complete-form check and the
  total can be ordinary constraints/triggers instead of application code.

`results.pct`/`grade`/`gpa`/`classOfAward`/`competent` are
trigger-maintained plain columns, not Postgres `GENERATED` columns —
Postgres forbids a generated column from referencing another generated
column, which rules out layering pct → grade → gpa that way. AGENTS.md
rule 3 is still satisfied: computed in Postgres, never accepted from a
client.

TP Practical criteria are **not** seeded. Its verbatim source
(`reference/forms/TP Practical form.txt`) has two numbering defects — a
repeated "vii." in section 2, and its final section ("PERSONALITY
ATRIBUTIES", 4 pts) has no section number in the extract, though the
totals (15+20+8+3+4=50) confirm it's a real fifth section. Still
unresolved as of this entry.

The trainee register also surfaced two data-quality problems that block
a real import: registration number `MVTTC/CAVT/2025/0128` used for both
"Rafael" and "Raphael Pato Mohele" (Route 2), and the e-mail
`rashidmujwahuzi@gmail.com` shared by two different trainees (Route 1 and
Route 2). User will correct the source file and re-send — `import-
trainees.ts`'s `validateRoster()` reproduces both as regression tests
(`import-trainees.test.ts`) so a still-imperfect resend fails loudly
rather than importing silently.

**Watch out for**
Nothing in this migration has been applied to a real database — no
Supabase project is connected from this session. Every guarantee was
instead proven against a **throwaway local Postgres 16 Docker
container** (`postgres:16-alpine`, port 55432, removed after use) with a
minimal stand-in `auth` schema (`packages/db/scripts/local-auth-stub.sql`,
also meant for local dev/CI): both migrations applied cleanly, and 15
manual smoke-test assertions covering every PLAN.md 0.2/0.3 guarantee
passed (maxima rejection, one-supervisor-two-slots rejection, complete-
form check including atomic rollback of a rejected partial submission,
two-assessor averaging to one decimal with correct grade/GPA/lock,
assessor-independence RLS before/after both submit, coordinator
read-only, append-only REVOKEs for all three roles, audit attribution,
audit hash chain). `pgtap/phase0.sql` itself was then further verified
by swapping in stub `plan`/`is`/`throws_ok`/`lives_ok`/`finish`
functions (the real `pgtap` extension isn't installable offline here) —
all 15 assertions passed against the real migrations. The CI `pgtap` job
now actually applies the migrations and runs this suite (previously a
no-op placeholder) using `postgres:16` + `apt-get install
postgresql-16-pgtap` inside the service container — that specific
installation step has **not** been exercised in a real GitHub Actions
run yet; watch the first CI run on this PR closely.

Two real bugs were caught and fixed during this local verification, both
worth knowing about: (1) Postgres forbids a transition table
(`REFERENCING NEW TABLE`) on a trigger spanning more than one event, so
`criteria`'s maxima-check trigger is actually two triggers (insert,
update), not one `AFTER INSERT OR UPDATE`. (2) A rejected `assessment_
mark_items` submission rolls back **the whole statement**, including any
rows in it that individually looked valid — there is no such thing as a
"partially accepted" submission, by design, but it means a retry must
resend every item, not just the missing ones.

**Verified by**
`pnpm lint && pnpm test && pnpm typecheck` clean (40 Vitest cases across
`packages/shared` and `packages/db`, including `criteria.test.ts`'s
arithmetic verification of the seeded VETA maxima and `import-
trainees.test.ts`'s reproduction of both real data-quality defects). The
manual Postgres 16 verification and the pgTAP dry run described above.
`pnpm --filter @tathmini/web build` still clean.

---

## 2026-09-04 · feature · Phase 0 toolchain scaffold; grading engine ported to TypeScript

**Kind:** feature
**Phase:** 0
**Commit / PR:** (pending — see below)

**What changed**
Repository initialised (`git init`) and the handoff pack committed as-is.
pnpm workspace created: `apps/web` (Next.js 15 App Router, React 19, TS
strict, Tailwind v4), `packages/shared` (Zod schemas, grading engine),
`packages/db` (Drizzle/pgTAP tooling, no schema yet). ESLint 9 flat config,
Prettier, commitlint + simple-git-hooks enforcing Conventional Commits, and
a GitHub Actions CI workflow (lint/typecheck/unit/pgTAP jobs) are all wired
and passing (`pnpm lint && pnpm test && pnpm typecheck`, plus a clean
`next build`).

The grading engine (`gradeFor`, `classOfAward`, `gpaFor`, `evaluate`,
`averageTotals`) was ported from `reference/Tathmini.dc.html` into
`packages/shared/src/grading.ts` with Vitest covering every boundary case
named in `PLAN.md` 0.4 (39.9/40/49.9/50/64.9/65/79.9/80/100, and the
(79.0, 76.0) → 77.5 averaging case). Generic Zod building blocks for a
criterion mark — the points scale with its below-half comment trigger, the
IPT 1–5 scale with its ≤3 comment trigger and no-zero constraint, and a
completeness gate — landed in `packages/shared/src/schemas.ts`.

**Why this way**
`AGENTS.md` requires stopping before any migration, RLS change, or anything
that could alter a stored mark or grade — so the actual Drizzle schema, RLS
policies, and instrument/criteria seed were deliberately **not** written
this session. Two open questions block them and are not guessed at:

1. Where "route" lives. `CONTEXT.md` and the RLS policies sketched in
   `PLAN.md` 0.3 treat a supervisor's route as load-bearing, but it is not
   one of the eleven named tables. Left unresolved in `packages/db/src/schema.ts`
   as a comment rather than assumed.
2. The verbatim `reference/forms/TP Practical form.txt` has two numbering
   defects: a repeated "vii." in section 2 ("Emphasized safely measure" /
   "Practical performance intergraded with knowledge..."), and its final
   section ("PERSONALITY ATRIBUTIES", 4 pts) has no section number at all
   in the extracted text, though the totals (15+20+8+3+4=50) confirm it is
   a real fifth section. `AGENTS.md` forbids renumbering a VETA section
   without confirmation, so `criteria` is not seeded.

Separately: I had flagged in review that `CONTEXT.md`'s "same COMPETENT /
NOT COMPETENT tick boxes" non-negotiable appeared to contradict the
verbatim paper form, which literally reads "Standard attained / Standard
yet to be attained." Checking `reference/Tathmini Result Report.dc.html`
resolved this — the prototype's printed report already deliberately prints
"COMPETENT / NOT COMPETENT" (lines 87–92, 409, 499), diverging from the
paper form's own tick-box label as a considered, already-built decision.
Not a gap; retracted.

The grading engine and the generic Zod pieces above were built anyway,
without waiting on the two open questions, because they are pure functions
fully specified by the verbatim grading key and the prototype's own
`gradeFor`/`gpaFor`/`resultOf` — nothing about the route or numbering
questions touches them.

**Watch out for**
`packages/db/src/schema.ts` is a stub with a comment explaining the block —
do not fill it in without the route-table and TP-Practical answers landing
in this file first. The CI `pgtap` job is a placeholder that currently
exits 0 on nothing; when the schema lands it must actually run the pgTAP
suite against the Postgres service container, not stay green by default.
Supabase project creation, Sentry, and GitHub branch protection all need
accounts/access only the user has — not something to attempt from here.

**Verified by**
`pnpm lint && pnpm test && pnpm typecheck` clean (27 Vitest cases in
`packages/shared`); `pnpm --filter @tathmini/web build` produces a clean
static build at 105 kB first-load JS (under the 180 KB budget).

---

## 2026-09-04 · decision · Project specification frozen; handoff pack written

**Kind:** decision
**Phase:** pre-0
**Commit / PR:** —

**What changed**
The prototype phase closed. `CONTEXT.md`, `AGENTS.md`, `CLAUDE.md`,
`ROADMAP.md` and `PLAN.md` written from the working prototype, the verbatim VETA
forms and the technical architecture document. Implementation has not started —
the repository is an empty folder awaiting Phase 0.

**Why this way**
The prototype settled the hard product questions cheaply — offline-first
marking, gating, auto-comments inside the editable comment box, PDF preview
before an irreversible send, two independent assessors averaged, and the
reassignment round-trip. Freezing those as written context means the build
argues about implementation, not about product.

Seven open decisions were put to the College and answered:

| Decision | Answer |
|---|---|
| Data residency | Managed Supabase, `af-south-1` Cape Town |
| Super Admin may correct a mark | Yes — superseding revision with typed reason, never in place |
| Assessors far apart | Just average; no flagging, no third assessor |
| Trainee accounts | None; PDF by e-mail only |
| GPS stamping | Never build it — declined as staff surveillance |
| Retention | 24 months of archives, to be reconfirmed against College policy |
| Engineering conventions | pnpm, Conventional Commits, PR-required, ESLint + Prettier, Vitest + Playwright, migration review on every PR |

**Watch out for**
Five questions in `PLAN.md § Open questions` are still unanswered — the three
e-mail recipient roles, the real supervisor roster with slot assignments, how
the trainee register is loaded, retention confirmation, and the SMS gateway
account. None block Phase 0; all block Phase 2 or 3.

Also: `reference/0001_tathmini_init.sql` predates the two-assessor model and the
verbatim criteria. It is a sketch. The Phase 0 schema supersedes it entirely —
do not migrate from it.

**Verified by**
Not applicable — no code yet.
