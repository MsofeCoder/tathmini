# Tathmini

Digital assessment sheet for Morogoro Vocational Teachers' Training College
(MVTTC), replacing the paper-based VETA Teaching Practice (TP) and Industrial
Practical Training (IPT) assessment forms with an offline-first PWA.

**Start here, not in this file:**

1. [`AGENTS.md`](./AGENTS.md) — operating rules for working in this repo
2. [`CONTEXT.md`](./CONTEXT.md) — the domain, the roles, decisions already made
3. [`ROADMAP.md`](./ROADMAP.md) — which phase is active and its exit gate
4. [`MEMORY.md`](./MEMORY.md) — the project's append-only decision log

This file is the human quickstart only — how to get the workspace running
locally. It does not duplicate the "why" that lives in the files above.

## Stack

pnpm workspace · Next.js 15 (App Router) · React 19 · TypeScript strict ·
Tailwind CSS v4 · Supabase (Postgres 16, Auth, Storage) · Drizzle ORM ·
Zod · Vitest · pgTAP. See `AGENTS.md` § Stack for the full, fixed list and
what was rejected.

## Layout

```
apps/web           Next.js PWA (supervisor, coordinator, admin surfaces)
packages/shared     Zod schemas + grading engine, imported by client and server
packages/db         Drizzle schema, migrations, RLS/functions, pgTAP suite, seed data
reference/          The prototype, verbatim VETA forms, architecture doc — read-only
```

## Prerequisites

- Node.js ≥ 20, pnpm ≥ 9 (`corepack enable` will pick up the pinned version)
- Docker, for running Postgres locally (no hosted Supabase project exists yet
  — see `ROADMAP.md` Phase 0)

## Getting started

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test
pnpm --filter @tathmini/web dev   # http://localhost:3000
```

## Database

The College's Supabase project (`af-south-1`) is connected and every
migration in `packages/db/migrations/` is applied to it. Prove a schema
change against a local throwaway Postgres before applying it live — see
[`packages/db/README.md`](./packages/db/README.md) for that workflow,
including how to run the pgTAP suite without touching the real project.

## Deployment (Vercel)

`vercel.json` at the repo root already tells Vercel how to build this
pnpm workspace, so **leave the project's Root Directory as the repo
root** — do not set it to `apps/web`, or the workspace packages
(`@tathmini/shared`) will not resolve.

Set these in the Vercel project (Production _and_ Preview):

| Variable                        | Where to get it       |
| ------------------------------- | --------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | `apps/web/.env.local` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `apps/web/.env.local` |

Both are safe to expose — the anon key is public by design; RLS is what
guards the data.

Set the function region to **Cape Town (`cpt1`)** if the plan allows it.
The default (US East) puts a transatlantic round trip on every render,
and `/home` alone issues seven Supabase queries plus the middleware auth
check.

**After the first deploy, check `https://<domain>/sw.js` returns
JavaScript, not a 404.** It is generated into `apps/web/public/` during
the build and is gitignored; if it is missing, the service worker never
registers and offline support is silently dead. Also confirm `/offline`
loads without a session — it is a public path by design (see
`middleware.ts`).

## Environment variables

Copy `.env.example` to `.env.local` and fill in what you have. Nothing is
required to run `pnpm lint`/`typecheck`/`test`/`build` — see the comments
in `.env.example` for what each variable gates.

## Conventions

- **pnpm only** — never npm or yarn.
- **Conventional Commits**, enforced by a commit-msg hook
  (`feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`, `db:`, `ci:`).
- **PRs required** — no direct commits to `main`. See `AGENTS.md` for what
  needs explicit sign-off before it merges (migrations, RLS, auth, anything
  that could alter a stored mark).
- `pnpm lint && pnpm test && pnpm typecheck` must be clean before a PR is
  called done.
