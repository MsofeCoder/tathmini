# ROADMAP — Tathmini

Progress tracker. Tick boxes as work lands. **Do not start a phase until the
previous phase's exit gate passes** — the gates are the point, not the tasks.

Six phases, ~20 weeks to institutional handover, pilot at week 14.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done

---

## Phase 0 — Foundations (weeks 1–2)

Nothing to demonstrate at the end of this phase. That is why it gets skipped,
and why systems like this fail their first audit. Build it anyway.

- [x] Repo, pnpm workspace, TypeScript strict, ESLint + Prettier, CI
- [~] Next.js 15 App Router scaffold, Tailwind v4, Radix primitives — app scaffolded and building; Radix not yet added, no screen needs it yet
- [~] Supabase project in `af-south-1`; local dev via Supabase CLI — the College's real Supabase project (`azlwxriyhdshfhklonrx`) is connected and migrations `0000`–`0004` are applied (2026-09-04, see `MEMORY.md`); local dev *via the Supabase CLI itself* is still not set up — the local-Postgres workflow in `packages/db/README.md` remains the documented path for proving a schema change before it's applied live
- [x] Drizzle schema — 13 tables (11 from `CONTEXT.md`/`PLAN.md` plus `routes` and `assessment_mark_items`; see `MEMORY.md` for why) — written, typechecked, proven against a throwaway local Postgres 16, and applied to the real Supabase project (2026-09-04, see `MEMORY.md`)
- [x] RLS policies on every table, default deny — written in `packages/db/migrations/0001_rls_and_functions.sql`; applied to the real Supabase project and proven there (18/18 pgTAP assertions, 2026-09-04, see `MEMORY.md`)
- [x] Seed the three instruments with **verbatim** criteria from `reference/forms/` — all three (TP Theory, TP Practical, IPT) are arithmetic-verified (`packages/db/src/seed/criteria.ts`), live in the real Supabase project, and tracked as idempotent migrations (`packages/db/migrations/0005_seed_tp_theory_ipt_criteria.sql`, `0006_seed_tp_practical_criteria.sql`, 2026-09-04, see `MEMORY.md`). TP Practical's numbering defects are resolved: the user supplied a corrected source (`Fomu ya Assessment TP_Practical Final.docx`) fixing the missing section-5 number; the section-2 duplicate "vii." is still literally present in that source but the user confirmed the fix (second "vii." → "viii."), applied in `criteria.ts`'s `itemCode` only
- [~] Zod schemas for a valid assessment, shared client/server — the generic points/IPT criterion-mark schemas and the completeness gate are built (`packages/shared/src/schemas.ts`); the concrete per-instrument schema was blocked on TP Practical's criteria — unblocked now that those are seeded (2026-09-04), but not yet written
- [x] Grading functions — total, %, grade, GPA, Class of Award, verdict — TypeScript reference implementation (`packages/shared/src/grading.ts`) and the matching Postgres functions/triggers (`veta_pct`/`veta_grade`/`veta_gpa`/`veta_class_of_award`, `recompute_result()`) both written and verified to agree
- [x] pgTAP suite wired into CI — `packages/db/pgtap/phase0.sql` (18 assertions — grew from 15 when the `0002`/`0003` contact-channel constraint landed; this line wasn't updated at the time), all passing for real in GitHub Actions on PR #2, and re-run 18/18 against the real Supabase project (2026-09-04, see `MEMORY.md`)
- [ ] Sentry, environment secrets, branch protection on `main` — needs Sentry account and a GitHub remote with admin access, both the user's to provide. `.env.example` documents the vars each piece needs so wiring them up is a paste-in once the account exists

**Exit gate:** pgTAP proves in CI that a Coordinator token cannot write a mark,
a supervisor cannot read another assessor's slot, and a submitted mark cannot be
updated. Section maxima sum to each instrument's total.

---

## Phase 1 — Supervisor PWA, offline (weeks 3–6)

- [x] Auth: sign-in, forced password change on first use, session cookies — `@supabase/ssr`-based, live against `azlwxriyhdshfhklonrx`; `/login`, `/change-password`, `/home` (generic placeholder — real route list/dashboard is separate, still below), `middleware.ts` session gate; `users.must_change_password` + `clear_own_password_change_flag()` RPC (migration `0009`). Verified end-to-end in a real browser 2026-09-04 — see `MEMORY.md`
- [x] Route list, overall counter (Assessed / Not Yet Assessed), status filters — `apps/web/src/app/home/route-list.tsx`, ported from the prototype's `showList` screen; per-trainee status derived server-side from `results.locked_at` + the signed-in supervisor's own submitted `assessment_marks` (`apps/web/src/lib/trainees.ts`); search box (no filter pills — those only exist on the coordinator's Phase 3 drill-down). Verified end-to-end in a real browser against a synthetic test route (migration `0011`) 2026-09-04 — see `MEMORY.md`
- [x] Trainee profile with pre-loaded particulars (nothing typed in the field) — `apps/web/src/app/trainee/[id]/page.tsx`, ported from the prototype's `showProfile`; particulars scoped to what the real `trainees` table actually has (`apps/web/src/lib/trainees.ts`'s `traineeParticulars()`/`trackPointsLabel()`) rather than the prototype's fuller fake fields. Deliberately excludes notify/draft-banner/start-assessment/reassignment — each belongs to a separate, still-unbuilt line. Verified end-to-end in a real browser against both a TP and an IPT synthetic test trainee 2026-09-04 — see `MEMORY.md`
- [x] Criterion-by-criterion marking, TP Theory + TP Practical + IPT — `/trainee/[id]/mark/[instrument]`, one route driven entirely by live `instruments`/`criteria` rows; the exact two-insert submit contract (`assessment_marks` then `assessment_mark_items`) verified live end-to-end for all three instruments, 2026-09-04, see `MEMORY.md` (surfaced and fixed a real bug in `validate_and_finalize_mark()`, migration `0012`). A deliberate simplification vs. the prototype's step-wizard: one scrolling page per instrument, not a separate jump-menu/steps chrome — see `MEMORY.md` for why
- [x] IPT 1–5 rating scale; comment trigger at ≤ 3 — `apps/web/src/lib/marking.ts`, reuses `iptCriterionMarkSchema()`'s threshold, unit-tested and live-verified (`TEST TRAINEE 4`, 2026-09-04)
- [x] Gating: no skipped criteria, alerts naming unscored items with jump-links — `computeGaps()` in `apps/web/src/lib/marking.ts`, also gates a scored-but-flagged criterion missing its required comment; re-validated server-side in `actions.ts`, never trusted from the client
- [ ] Auto-comment phrase bank, landing **inside** the editable comment box — deliberately not built this round (HANDOFF.md's narrowed cut); each criterion has its own plain comment box instead
- [x] Draft persistence per tap; resume after force-quit or battery death — `apps/web/src/lib/drafts.ts` (Dexie), saves every score/comment locally keyed per (trainee, instrument), restored on mount. **Browser-verified 2026-09-05** against a real supervisor (`denis.michael`, TP ROUTE 6) and a real trainee: scoring one criterion wrote a `drafts` row keyed `<traineeId>:<instrumentId>` with the criterion id, score and timestamp; a full page reload restored "1 of 41 scored", the section subtotal and the pressed button. See `MEMORY.md`
- [~] Dexie outbox: idempotent UUID keys, exponential backoff, replay on reconnect — `apps/web/src/lib/outbox.ts` + `apps/web/src/app/outbox-drainer.tsx`, keyed per (trainee, instrument) with the database's own unique index as the real idempotency backstop, replayed on `online`/focus. **Exponential backoff now built** (10s → 20s → 40s, capped at 5 min, ±20% jitter, PR #27): without it the drainer retried every entry on every `online` event, and in flapping signal a submission failing for a reason no retry can fix was re-sent on every flap. Still **not** Background Sync — deliberate, see `MEMORY.md`. Stays `[~]` for one reason only: **the exit gate has never been proven in a real browser**
- [~] Serwist service worker, manifest, maskable icons, offline fallback, update prompt — service worker + offline fallback built (`apps/web/src/app/sw.ts`, `next.config.ts`), serving the new `/offline` route when a navigation fails. Web app manifest, icons (incl. maskable) and installability now built too (`apps/web/src/app/manifest.ts`, placeholder "TM" icon set — see `MEMORY.md` 2026-09-05); `middleware.ts` updated to exclude `manifest.webmanifest` from the auth gate, since the fix was worthless without that. A real install screen also now exists — `/` (`apps/web/src/app/install-gate.tsx`), ported from the prototype's `install` screen, wired to a real `beforeinstallprompt`, shown once per browser — see `MEMORY.md` 2026-09-05. **Still not** built: update prompt. Note `reloadOnOnline` is deliberately disabled — Serwist's default reloads the page when signal returns, which would interrupt a supervisor mid-assessment in flapping signal
- [x] Offline-capable marking end to end — the real requirement behind the three lines above, and bigger than any of them: every other screen is server-rendered against Supabase and `middleware.ts` validates the session over the network, so nothing but a client-rendered page fed from IndexedDB can work with no signal. One online visit to the route list now caches the whole route (trainees, this supervisor's slot for each, every instrument's criteria) and prefetches `/offline`; `/offline` then renders the *same* `MarkingForm` from that cache and submits through the outbox. See `MEMORY.md` for the architecture and its limits
- [x] Pending-sync badge and queue view — a **Pending** tab in the bottom navigation carrying the count (`Pending · N`, the prototype's own treatment), listing each stuck submission by trainee, instrument, when it was marked and any failed attempts (`apps/web/src/app/pending/page.tsx`, PR #22); the offline screen carries the same list (PR #21). Read from IndexedDB on the client, because the reason something is queued is that the network failed — a screen needing the network to describe its own backlog would be empty exactly when it matters

**Exit gate:** a complete assessment survives airplane mode, a force-quit and a
reboot; reconnecting produces exactly one submission, never two.

---

## Phase 2 — Two assessors, results, reports (weeks 7–9)

- [x] Assessor-slot independence enforced by RLS (a2 cannot see a1's marks) — already built in migration 0001 (`assessment_marks_select`/`assessment_mark_items_select`'s `submitted_slot_count(...) >= 2` gate); this checkbox was just stale, discovered while scoping PDF generation, see `MEMORY.md` 2026-09-05
- [x] Server-side scoring; official average of the two slots — already built in migration 0001 (`recompute_result()` trigger, `veta_grade()`/`veta_gpa()`/`veta_class_of_award()`); same stale-checkbox discovery, see `MEMORY.md` 2026-09-05
- [x] Status derivation: pending → partial (1 of 2) → locked (both in) — `results.locked_at` set once `submitted_marks >= expected_marks` in `recompute_result()`; surfaced client-side by `deriveStatus()` (`apps/web/src/lib/trainees.ts`, built Phase 1)
- [x] PDF generation reproducing the VETA form, per assessor + consolidated page — `apps/web/src/lib/reports/{data,render,pdf}.ts`, both TP and IPT; migration 0014 (**applied live 2026-09-05** — reports table, private Storage bucket, four RLS policies) adds the `reports` table and Storage bucket it needs. **Still unproven end to end:** production has zero locked results, and both the UI gate (`locked_at`) and the insert policy require one, so the download button is unreachable and headless Chromium has never run on Vercel. See `MEMORY.md`
- [x] SHA-256 hash stored with each generated report — `reports.sha256_hash`, migration 0014
- [x] PDF preview in-app before submit (the exact file that will be sent) — an eye beside `Submitted ✓` and a `Preview report` button on the trainee profile, both opening `/trainee/[id]/report/preview` (PR #21/#18). Serves the **same markup** `renderReportHtml()` gives Chromium to print, so there is no second template to drift from `reference/Tathmini Result Report.dc.html`. HTML rather than a rendered PDF deliberately: preview is tapped casually and repeatedly, and every PDF call costs a headless-Chromium cold start — Chromium is reserved for the one deliberate action that stores a file
- [ ] E-mail delivery to the three named recipient roles (Brevo)
- [ ] Swahili notification: SMS / WhatsApp / e-mail deep links, personalised
- [ ] Central send path + `notifications` delivery record (Beem Africa)

**Exit gate:** two supervisors mark one trainee, neither sees the other, the
average is correct to one decimal, and the generated PDF matches the paper form
field for field.

---

## Phase 3 — Admin console (weeks 10–12)

- [~] Super Admin: account creation, password set, deactivate — **deactivate/reactivate built** (`/admin/users`, and `users.active` is now actually checked at sign-in, which it never was before); creation and password-setting deliberately stay in `packages/db/src/scripts` because both need the service-role key, which is kept out of the deployed app (see `MEMORY.md` 2026-09-06)
- [ ] TOTP second factor for both Super Admin accounts
- [x] Route management and assignment of assessor slots — `/admin/routes` reassigns either slot on a route, and `/admin/trainees/[id]` moves one trainee to another route; both rewrite `routes` **and** `assignments` together, since `assignments` is what RLS reads. A slot carrying a submitted mark is refused and named, not silently moved (`lib/admin/reassignment.ts`, unit-tested). Creating/renaming a route is deliberately not offered — a route code is matched verbatim by the roster importers
- [~] Reassignment state machine: requested → accepted / declined, with inbox badge — the **administrator's half is built**: `/admin/trainees/[id]` hands a single assessor slot to another supervisor without moving the trainee off their route, refusing once that slot has submitted a mark, and files a `reassignments` row already `accepted` for provenance. The supervisor-initiated half — a request another assessor accepts or declines, with an inbox badge — is still unbuilt, and the `/moves` tab stays inert
- [ ] Override as a superseding revision with mandatory typed reason
- [x] Coordinator read-only dashboard (no write grant exists for the role) — the whole console renders read-only for `coordinator` (`lib/admin/access.ts`); every write is refused twice, once with a readable message and once by Postgres. No coordinator account exists yet, so this is unexercised against a real session
- [ ] Excel export — assessor marks sheet + official averages sheet + provenance
- [x] Audit log viewer, filterable by actor, action, trainee, date — `/admin/audit`, filterable by table and paged; actor names resolved, trainee rows linked. Filtering by actor and by date range is not built (the table filter covers the cases that have come up)
- [ ] **Backup panel:** last backup status, 30-day outcome calendar, run-now,
      gated download, last restore-rehearsal result
- [ ] Nightly `pg_dump` → `age`-encrypted off-site storage; failure alerts
- [x] Register correction and register health — not originally listed, but it is what a Super Admin actually spends time on: `/admin/trainees` searches all 546 rows and `/admin/trainees/[id]` corrects particulars and moves routes, replacing the hand-written migrations that did this (0023, 0026, the IPT update). `/admin` counts the defects that have really occurred — test rows on real routes, trainees sharing an e-mail address, empty assessor slots, unassigned trainees — every time it is opened
- [ ] Deleting a trainee from the console — blocked on purpose: `delete on trainees` is revoked from every signed-in role because it cascades to marks. Needs a reviewed migration adding a guarded, audit-logging function; the console explains this and shows the SQL instead of pretending the button is missing

**Exit gate:** a restore rehearsal completes into a scratch database, row counts
and checksums verify, and the panel reports the result.

---

## Phase 4 — Hardening and pilot (weeks 13–14)

- [ ] Penetration test; no high or critical finding open
- [ ] Accessibility audit — contrast, targets, keyboard, screen reader
- [ ] Performance budgets enforced in CI on a throttled mid-range Android
- [ ] Swahili interface strings across the supervisor flow
- [ ] Rate limiting on sign-in and export; lockout after five failures
- [ ] CSP, HSTS, security headers verified
- [ ] Supervisor training session and one-page field guide
- [ ] Pilot on a single route with real trainees

**Exit gate:** pilot supervisors sign off; no high or critical finding open.

---

## Phase 5 — Rollout and handover (weeks 15–20)

- [ ] Full cohort rollout
- [ ] Parallel paper run for one term
- [ ] Reconciliation: paper vs digital, every trainee
- [ ] Handover documentation — runbook, restore procedure, credential inventory
- [ ] Repository, Supabase project and backup encryption key transferred to the College
- [ ] Maintenance retainer agreed and documented

**Exit gate:** paper and digital results agree for every trainee in the parallel
run; the College can restore a backup without the developer.

---

## Deferred — not in scope, do not build

- GPS stamping at submission (declined by the College as staff surveillance)
- Trainee accounts or a trainee portal (results go out by e-mail only)
- Divergence flagging between assessors (the College chose plain averaging)
- Per-supervisor marking-variance reports (revisit once real data exists)
- WhatsApp Business API (deep links cost nothing and work today)
