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
- [ ] Supabase project in `af-south-1`; local dev via Supabase CLI — needs the College's/maintainer's Supabase account, not something an agent can provision
- [ ] Drizzle schema — all 11 tables (see `CONTEXT.md` and `PLAN.md`) — blocked on the route-table and TP Practical numbering questions in `MEMORY.md`
- [ ] RLS policies on every table, default deny — blocked on the schema above
- [ ] Seed the three instruments with **verbatim** criteria from `reference/forms/` — blocked on the TP Practical numbering questions
- [~] Zod schemas for a valid assessment, shared client/server — the generic points/IPT criterion-mark schemas and the completeness gate are built (`packages/shared/src/schemas.ts`); the concrete per-instrument schema is blocked with the schema above
- [~] Grading functions — total, %, grade, GPA, Class of Award, verdict — TypeScript reference implementation done and tested (`packages/shared/src/grading.ts`); the Postgres generated columns still need writing and must agree with it
- [~] pgTAP suite wired into CI — CI job scaffolded and running; no pgTAP suite exists yet because there is no schema
- [ ] Sentry, environment secrets, branch protection on `main` — needs Sentry account and a GitHub remote with admin access, both the user's to provide

**Exit gate:** pgTAP proves in CI that a Coordinator token cannot write a mark,
a supervisor cannot read another assessor's slot, and a submitted mark cannot be
updated. Section maxima sum to each instrument's total.

---

## Phase 1 — Supervisor PWA, offline (weeks 3–6)

- [ ] Auth: sign-in, forced password change on first use, session cookies
- [ ] Route list, overall counter (Assessed / Not Yet Assessed), status filters
- [ ] Trainee profile with pre-loaded particulars (nothing typed in the field)
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
- [ ] Route management and assignment of assessor slots
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
