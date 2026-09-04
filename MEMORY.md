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
