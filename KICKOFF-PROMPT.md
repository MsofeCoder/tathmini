# Kickoff prompt

## How to set up the folder

Put these five files at the root of your empty project folder:

```
CONTEXT.md
AGENTS.md
CLAUDE.md
ROADMAP.md
PLAN.md
MEMORY.md
```

Then add the reference material the files point at:

```
reference/
  Tathmini.dc.html                          (the prototype — behavioural spec)
  Tathmini Result Report.dc.html            (the VETA-matching printed report)
  Tathmini Technical Architecture.dc.html   (stack, security, backup design)
  Tathmini Demo Guide.dc.html               (copy tone, stakeholder FAQ)
  forms/                                    (extracted verbatim VETA form text)
  0001_tathmini_init.sql                    (old sketch — superseded)
```

`git init` and commit all of it **before** the agent's first run, so the files
are versioned from the start rather than added retroactively.

---

## The kickoff prompt

Paste this as your first message to the coding agent.

```text
You are the engineering lead on Tathmini, a vocational-assessment PWA for
Morogoro Vocational Teachers' Training College (MVTTC) in Tanzania.

Before writing any code, read in this order:

1. AGENTS.md   — how to work here, and what to stop and ask about
2. CONTEXT.md  — the domain, the roles, the decisions already made
3. ROADMAP.md  — the six phases and their exit gates
4. PLAN.md     — the active phase's task breakdown
5. MEMORY.md   — the most recent entries

Then, in one message and without writing code:

- State which phase is active and what its exit gate is.
- Tell me anything in those files that is contradictory, ambiguous, or
  insufficient to build from. Be specific; do not be polite about gaps.
- Post your proposed task breakdown for Phase 0 as a revision of PLAN.md,
  with a verification named for every task.
- List anything you would need from me before you can start.

Then stop and wait for my approval.

Three rules that override your defaults:

- Stop and ask before any database migration, any change to RLS, auth, roles or
  sessions, anything that could alter a stored mark, and any new dependency
  that ships to the client bundle.
- Authorisation belongs in Postgres row-level security, never in a React
  condition. If a feature seems to require relaxing RLS, tell me the feature
  needs redesigning instead of relaxing it.
- VETA criterion wording is verbatim from reference/forms/. Never paraphrase a
  criterion, round a maximum, or renumber a section.

Append to MEMORY.md after every feature, decision or bug fix.
```

---

## Daily session prompt

For every session after the first:

```text
Read AGENTS.md, then the active phase in ROADMAP.md, then the last three
entries in MEMORY.md. Tell me where we are and what you propose next, then
wait.
```

---

## Why the prompt is short

Two findings from current practice shaped this:

- **Agent files are read every session; prompts are not.** Durable rules belong
  in `AGENTS.md` where they apply to every invocation. A long prompt that
  restates them is spent context, and it drifts out of date the moment the files
  change.
- **Generic, verbose agent instructions measurably reduce task success** and add
  steps per task. Both the prompt and the files above deliberately carry only
  what an agent could not infer — the VETA domain, the College's settled
  decisions, and the four non-negotiable integrity rules.

The prompt's real job is to make the agent *read the files, report the gaps, and
stop*. Everything else is already written down.

---

## What to expect on the first run

A good agent will come back with genuine gaps, most likely: the five unanswered
questions in `PLAN.md § Open questions`, and a request for the real trainee
register and supervisor roster. That is the correct response — answer those and
approve Phase 0.

If it comes back proposing screens or starting a Next.js scaffold without
mentioning RLS or pgTAP, stop it and point it at `AGENTS.md § The four rules
that are the point of this project`. Phase 0 has nothing to demonstrate at the
end, which is exactly why agents skip it.
