# CLAUDE.md

Claude Code entry point for Tathmini.

> **If [`HANDOFF.md`](./HANDOFF.md) exists in this repo, read it first** —
> it's a dated, disposable briefing for a session that just picked this
> project up mid-sprint. It doesn't override anything below; it just says
> where to start.
>
> **This project goes to production on the evening of Sunday 6 September
> 2026**, and the College assesses real trainees on it from Monday morning.
> `HANDOFF.md` carries the cut list: what is in scope for go-live and what
> was deliberately dropped. Anything not on it waits until after go-live.

**All working rules live in [`AGENTS.md`](./AGENTS.md). Read it before anything
else.** This file exists only because Claude Code loads `CLAUDE.md` by name.

## Session start

Read in this order:

1. `AGENTS.md` — how to work here, and what to stop and ask about
2. `CONTEXT.md` — the domain, the roles, the decisions already made
3. `ROADMAP.md` — which phase is active and what its exit gate is
4. `MEMORY.md` — the last 3–4 entries, so you do not undo recent work

Then state which phase you believe is active and what you intend to do next,
before writing code.

## Reminders that matter most here

- **Stop and ask** on migrations, RLS, auth, anything that could change a stored
  mark, and any new client-bundle dependency.
- **The field app is one precached app shell.** Any new supervisor screen is a
  component in `components/screens/` registered in `lib/local/route-match.ts` —
  never a route file, never `next/link`, never a server read. `AGENTS.md` §
  "The app shell" has the ten rules; a new Dexie store takes the NEXT version
  number, never a reused one.
- The prototype in `reference/Tathmini.dc.html` is the behavioural spec. Read the
  relevant flow before designing a screen.
- Criterion wording is **verbatim** from `reference/forms/`.
- `pnpm format:check && pnpm lint && pnpm test && pnpm typecheck` green before
  reporting done. **`format:check` is easy to forget and CI runs it inside the
  `lint` job** — a branch that is otherwise perfect fails on formatting alone.
  `pnpm format` fixes it.
- Append to `MEMORY.md` after every feature, decision or bug fix.

## Sub-agent guidance

When you delegate, pass the sub-agent the relevant section of `CONTEXT.md` — a
sub-agent without domain context will paraphrase VETA criteria and invent
grading thresholds. Both are project-fatal.
