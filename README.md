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

Set the project's **Root Directory to `apps/web`** (Settings → Build and
Deployment). This is a Vercel dashboard setting and cannot be configured
from the repo — Vercel detects the Next.js version from the
`package.json` in the Root Directory, and the repo root has no `next`
dependency, so leaving it at the repo root fails with
`No Next.js version detected`.

Everything else is pinned by `apps/web/vercel.json` (Vercel reads
`vercel.json` **from** the Root Directory). Build command and output
directory are declared there so they cannot drift from a stale dashboard
override — a real failure mode here: an earlier root `vercel.json` left
`outputDirectory: apps/web/.next` saved in the project settings, which
then resolved relative to the new Root Directory as
`apps/web/apps/web/.next` and broke every deploy until it was overridden.

With the Root Directory set, Vercel still installs from the workspace
root (it detects the pnpm workspace), so `@tathmini/shared` resolves
normally, and `apps/web/public/` — including the generated `sw.js` — is
served natively.

Set these in the Vercel project (Production _and_ Preview):

| Variable            | Where to get it       |
| ------------------- | --------------------- |
| `SUPABASE_URL`      | `apps/web/.env.local` |
| `SUPABASE_ANON_KEY` | `apps/web/.env.local` |

Note the **absence of a `NEXT_PUBLIC_` prefix** — that is deliberate and
the names must match exactly. Every Supabase call is server-side
(`src/lib/supabase/server.ts` and `src/middleware.ts`); nothing in the
browser reads these, so the prefix would only inline both values into
the client bundle for no benefit. Adding it back would not break the
app, which is precisely why it is worth stating: it would silently widen
exposure. The anon key is public by design and RLS is the real
boundary — keeping it server-only is defence in depth.

A mismatched or truncated `SUPABASE_ANON_KEY` does not fail loudly. The
app renders normally and every sign-in returns "That username and
password do not match an account issued by the Administrator", which
looks like a credentials problem rather than a configuration one. If
sign-in fails for an account you know is good, check this first.

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
