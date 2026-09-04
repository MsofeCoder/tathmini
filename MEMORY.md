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
