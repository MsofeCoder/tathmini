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
- [ ] Criterion-by-criterion marking, TP Theory + TP Practical + IPT
- [ ] IPT 1–5 rating scale; comment trigger at ≤ 3
- [ ] Gating: no skipped criteria, alerts naming unscored items with jump-links
- [ ] Auto-comment phrase bank, landing **inside** the editable comment box
- [ ] Draft persistence per tap; resume after force-quit or battery death
- [ ] Dexie outbox: idempotent UUID keys, exponential backoff, replay on reconnect
- [ ] Serwist service worker, manifest, maskable icons, offline fallback, update prompt
- [ ] Pending-sync badge and queue view

**Exit gate:** a complete assessment survives airplane mode, a force-quit and a
reboot; reconnecting produces exactly one submission, never two.

---

## Phase 2 — Two assessors, results, reports (weeks 7–9)

- [ ] Assessor-slot independence enforced by RLS (a2 cannot see a1's marks)
- [ ] Server-side scoring; official average of the two slots
- [ ] Status derivation: pending → partial (1 of 2) → locked (both in)
- [ ] PDF generation reproducing the VETA form, per assessor + consolidated page
- [ ] SHA-256 hash stored with each generated report
- [ ] PDF preview in-app before submit (the exact file that will be sent)
- [ ] E-mail delivery to the three named recipient roles (Brevo)
- [ ] Swahili notification: SMS / WhatsApp / e-mail deep links, personalised
- [ ] Central send path + `notifications` delivery record (Beem Africa)

**Exit gate:** two supervisors mark one trainee, neither sees the other, the
average is correct to one decimal, and the generated PDF matches the paper form
field for field.

---

## Phase 3 — Admin console (weeks 10–12)

- [ ] Super Admin: account creation, password set, deactivate
- [ ] TOTP second factor for both Super Admin accounts
- [ ] Route management and assignment of assessor slots — including manually placing a trainee missing from any route (import gap) and moving a trainee to a different route (real September 2026 IPT roster had genuine duplicate-entry defects; no UI for this exists yet, but the DB/RLS layer already supports it — `trainees_admin_write` (migration `0001`) grants `super_admin` `UPDATE` on `trainees`, and it's the only role/action never `REVOKE`d there — see MEMORY.md)
- [ ] Reassignment state machine: requested → accepted / declined, with inbox badge
- [ ] Override as a superseding revision with mandatory typed reason
- [ ] Coordinator read-only dashboard (no write grant exists for the role)
- [ ] Excel export — assessor marks sheet + official averages sheet + provenance
- [ ] Audit log viewer, filterable by actor, action, trainee, date
- [ ] **Backup panel:** last backup status, 30-day outcome calendar, run-now,
      gated download, last restore-rehearsal result
- [ ] Nightly `pg_dump` → `age`-encrypted off-site storage; failure alerts

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
