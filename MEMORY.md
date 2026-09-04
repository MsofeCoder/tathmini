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
