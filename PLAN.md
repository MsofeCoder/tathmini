# PLAN.md

Working plan for the **active phase only**. Rewrite this file at the start of
each phase; do not let it accumulate history — that is `MEMORY.md`'s job.

## How to use this file

1. At the start of a phase, replace the *Current plan* section below with a task
   breakdown for that phase.
2. Post it and **wait for the user's approval** before writing code.
3. Keep the *Open questions* list live. An unanswered question about a mark, a
   grade or a policy blocks the task — do not guess.
4. When the phase's exit gate passes, move the summary into `MEMORY.md`, tick
   `ROADMAP.md`, and rewrite this file for the next phase.

### Plan quality bar

A task in this plan states **what will exist afterwards**, not what will be
worked on. "Add outbox" is not a task. "`useOutbox()` hook drains the Dexie
queue with idempotent UUID keys and exponential backoff; Playwright test proves
one submission arrives after two reconnects" is a task.

Every task names its **verification** — the test, the query, or the manual check
that says it is done. A task with no verification is not ready to start.

---

## Current plan — Phase 0, Foundations

**Status:** awaiting user approval
**Exit gate:** pgTAP proves a Coordinator cannot write a mark, an assessor
cannot read the other slot, and a submitted mark cannot be updated.

### 0.1 Repository and toolchain

| Task | Verification |
|---|---|
| pnpm workspace, Next.js 15 App Router, React 19, TS `strict` | `pnpm typecheck` clean on a bare app |
| ESLint + Prettier + Conventional Commits hook | A non-conforming commit is rejected |
| CI: lint, typecheck, unit, pgTAP on every PR | A red suite blocks merge |
| Branch protection on `main` | Direct push refused |

### 0.2 Schema (Drizzle)

Eleven tables. **Show the SQL and wait before running any of it.**

`users` · `trainees` · `instruments` · `criteria` · `assignments` ·
`assessment_marks` · `results` · `result_revisions` · `reassignments` ·
`notifications` · `audit_log`

| Constraint to build | Verification |
|---|---|
| `criteria` section maxima sum to the instrument total | pgTAP: inserting a mismatched set fails |
| One supervisor cannot hold both slots for one trainee | pgTAP: the second insert fails |
| `assessment_marks` unique per (trainee, slot) | pgTAP: duplicate rejected |
| Complete-form check — scored count must match the instrument | pgTAP: a 36-of-37 submission is refused |
| `result_revisions.reason` non-empty | pgTAP: empty reason rejected |
| `audit_log` hash-chained, no delete grant | pgTAP: `DELETE` fails for every role |

### 0.3 RLS policies

Default deny on every table, then:

| Policy | Verification |
|---|---|
| Supervisor reads/writes only their own slot, only on their route | pgTAP with a supervisor JWT |
| Assessor cannot read the other slot until both submitted | pgTAP: a1 in, a2 selects → 0 rows |
| Coordinator has `SELECT` only — no `INSERT`/`UPDATE`/`DELETE` grant exists | pgTAP: every write fails |
| Super Admin writes are permitted but attributed | pgTAP: write succeeds, audit row appears |
| No `UPDATE` grant on `assessment_marks` for any role | pgTAP: update fails as all three roles |

### 0.4 Grading engine (Postgres + Zod + Vitest)

| Task | Verification |
|---|---|
| Instrument seeds with verbatim criteria from `reference/forms/` | Diff against the extracted text — zero paraphrase |
| `results` totals/%/grade/GPA/Class/verdict as generated columns | Vitest table of boundary cases: 39.9/40/49.9/50/64.9/65/79.9/80/100 |
| Average of two slots to one decimal | Vitest: (79.0, 76.0) → 77.5 |
| IPT: 70 pts, 1–5 scale, no zero option | Vitest: score 0 rejected; 14 items × 5 = 70 |
| Comment trigger — below half max, or ≤ 3 on IPT | Vitest per criterion type |
| Zod schema shared by client and server | The same import path used in both; one test imports it twice |

### 0.5 Operations baseline

| Task | Verification |
|---|---|
| Sentry wired, secrets in env, service-role key server-only | Grep the client bundle for the key — zero hits |
| Supabase CLI local dev + migration workflow documented | A fresh clone reaches a seeded DB in one command |

---

## Open questions

Blocking questions for the user. Nothing here should be guessed.

| # | Question | Blocks |
|---|---|---|
| 1 | Who are the **three named recipient roles** for every result e-mail? Roles, not individuals, so the list survives staff changes. | Phase 2 e-mail delivery |
| 2 | Confirm the **real supervisor roster** and which assessor slot each holds. | Phase 0 seed, Phase 3 accounts |
| 3 | Is the **trainee register** exportable from an existing College system, or is it manual entry by a Super Admin? | Phase 0 `trainees` seed strategy |
| 4 | Confirm **24 months** archive retention against College policy. | Phase 3 backup retention |
| 5 | Preferred **SMS sender ID** and gateway account — Beem Africa or Africa's Talking? | Phase 2 central send |

## Assumptions in force

Recorded so they can be corrected rather than discovered later.

- Cohort size ~300 trainees, ~20 supervisors, two assessments each per cohort.
- Supervisors use their own Android phones; the College issues no devices.
- The College owns the Supabase project and the backup encryption key.
- One route belongs to one supervisor; a trainee's two assessors may be on
  different routes.
- Report PDFs are A4 (the College is metric).
