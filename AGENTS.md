# AGENTS.md

Operating rules for coding agents on Tathmini. Read `CONTEXT.md` for the domain
and `ROADMAP.md` for what phase we are in. Log what you did in `MEMORY.md`.

Only rules specific to *this* project are here. General good practice is assumed.

## Stop and ask

Do not proceed without the user's explicit approval when the change involves:

- **Any database migration.** Show the SQL and wait. Migrations run against real
  assessment records.
- **Anything touching RLS policies, auth, roles, or session handling.**
- **Anything that could alter a stored mark, total, grade or verdict.**
- **Adding a dependency** that ships to the client bundle.
- **Anything that would make a field screen need the server to render** — a
  route file under `app/`, a `next/link`, a server read inside a screen. See
  "The app shell" below; if a feature seems to require one, that is the
  conversation to have.
- **A decision listed in `CONTEXT.md` § "Decisions already made".**

Everything else: proceed, and record it in `MEMORY.md`.

## The four rules that are the point of this project

1. **Authorisation is a Postgres RLS policy, never a React condition.** If a
   feature can only work by relaxing RLS, the feature needs redesigning. Say so
   rather than relaxing the policy.
2. **`assessment_marks` is append-only.** No role gets an `UPDATE` grant. A
   correction inserts into `result_revisions` with a non-empty reason; both
   records stay readable.
3. **Scores, grade, GPA and the Competent verdict are computed in Postgres**
   (generated columns / functions). A client-supplied total is a bug, not an
   optimisation.
4. **An assessor can read only their own slot until both slots are submitted.**
   This is an RLS policy with a pgTAP test. Never a UI filter.

## The app shell — how the field app is built

The supervisor app is **one precached document**. `app/[[...slug]]/page.tsx`
renders `components/app-shell.tsx`, which reads the path on the device and
picks a screen; the service worker answers every in-app navigation with that
same document. Offline support is therefore a property of the app being
installed, not of which urls somebody happened to visit online.

This was reverted once by mistake and the reasons were lost with it. They are
in `MEMORY.md`, and these are the rules that fall out of them. **A new feature
in the field app follows all of them.**

1. **A field screen is a component in `components/screens/`, registered in
   `lib/local/route-match.ts`. Never a route file under `app/`.** A route file
   means a server render, which means the network, which means it is broken in
   a workshop. Adding the path to the routing table is what makes the worker
   serve it — there is nothing to precache and no url to warm.
2. **Screens read the device, never the server.** `useDeviceRows()` and the
   pure builders in `lib/local/`. If a screen needs something the device does
   not have, add it to the replica in `lib/sync/`, do not add a query.
3. **Navigation is a plain `<a href>`.** Never `next/link` in the field app:
   it fetches the target route's payload from the server, which is exactly the
   failure the shell removes. `@next/next/no-html-link-for-pages` is turned off
   in `apps/web/eslint.config.mjs` for this reason.
4. **Never `usePathname()` inside the shell.** The shell navigates with
   `history.pushState`, which `next/navigation` cannot see. Take the path as a
   prop, as `BottomNav` does.
5. **The shell's first render must be route-independent.** The server
   prerenders it for `/` and the worker replays those bytes at every url, so
   anything rendered before the mount effect must be identical everywhere.
   Reading the path during render reintroduces "Application error: a
   client-side exception has occurred".
6. **The shell rule in `sw.ts` must stay ahead of `defaultCache`.**
   Registering it afterwards compiles, reads as equivalent, and silently kills
   offline navigation.
7. **A desk tool is a normal server route and stays off the shell.** `/admin`
   and `/coordinator` are server-rendered on purpose — the whole cohort,
   aggregates, exports and the audit log are the wrong shape for a device
   replica, and caching an administrator's view of every trainee onto a phone
   is the wrong thing to do. `isShellPath()` is an ALLOWLIST, so a new area is
   safe by default: just do not add it to the routing table.
8. **A Dexie version number is spent the moment a build carrying it reaches a
   device.** Dexie replays only versions ABOVE the one a phone holds, so a
   second, different `version(8)` never runs on a phone that already took the
   first — no error, no upgrade, just stores that quietly do not exist. **Add a
   rung; never reuse, remove or renumber one.** Check the highest number in
   `lib/db.ts` and take the next. Two branches open at once must not both claim
   it.
9. **Anything needing a long budget is a route handler under `/api`, not a
   Server Action.** An action invoked from the shell posts to the shell's url
   and inherits the platform's default timeout, which a headless Chromium cold
   start alone exceeds. Report generation goes through
   `/api/reports/[traineeId]`; signing an already-stored file is fast enough to
   stay an action.
10. **Check the first-load budget before you finish.** The whole field app is
    one route, so every screen shares one bundle: `pnpm --filter web build` and
    read the `● /[[...slug]]` line against the 180 KB budget above.

If a change seems to need an exception to any of these, that is the thing to
stop and ask about.

## Before you write a screen

Read the corresponding flow in `reference/Tathmini.dc.html` first. The prototype
is the behavioural spec — gating, copy, empty states, celebration screens,
pending-sync badges are all settled there. Do not reinvent the interaction.

Criterion wording comes **verbatim** from `reference/forms/`. Never paraphrase a
VETA criterion, never round a maximum, never renumber a section.

## Stack (fixed — do not substitute)

- Next.js 15 App Router · React 19 · TypeScript `strict`
- Tailwind CSS v4 + Radix primitives (no component framework)
- Supabase — Postgres 16, Auth, Storage, Realtime · region `af-south-1`
- Drizzle ORM for schema and migrations
- Dexie 4 for the offline store · Serwist for the service worker
- Zod schemas shared by client and server — **one** definition of a valid
  assessment, imported by both
- ExcelJS (server, streamed) for `.xlsx` · Playwright/Chromium (server) for PDF
- Vitest · Playwright · pgTAP

Rejected on purpose, do not propose: React Native, Flutter, Firebase, Prisma,
`next-pwa`, PouchDB/RxDB sync, MUI, Chakra, Twilio, WhatsApp Business API.

## Conventions

- **pnpm.** Never npm or yarn.
- **Conventional Commits.** `feat:`, `fix:`, `chore:`, `refactor:`, `test:`,
  `docs:`, `db:` for migrations.
- **PR required. No direct commits to `main`.** Short-lived branches.
- **ESLint + Prettier** must pass before you call anything done.
- **Every PR containing a migration** gets the SQL quoted in its description.
- `pnpm format:check && pnpm lint && pnpm test && pnpm typecheck` green before you
  report completion. CI runs `format:check` inside the `lint` job, so a branch
  that passes the other three still fails the build on formatting alone.
  `pnpm format` fixes it.
- Add or update tests for what you change, even when nobody asked.

## Testing expectations

- **pgTAP is the priority suite.** It must prove: a Coordinator token cannot
  write a mark; a supervisor cannot read another supervisor's slot; a submitted
  mark cannot be updated; an incomplete form is rejected.
- **Vitest** for the grading rules — grade boundaries, GPA, averaging of two
  slots, IPT's 1–5 scale, the comment-trigger threshold (below half, or ≤ 3 on
  IPT).
- **Playwright** for the offline journeys: mark a full assessment with the
  network disabled, force-quit, reopen, confirm nothing was lost, reconnect,
  confirm exactly one submission arrives.
- A grading-rule change without a test is not done.

## Performance budget (measured in CI on a throttled mid-range Android)

| Metric | Budget |
|---|---|
| LCP, 3G, cold | < 2.5 s |
| First-load JS, gzipped | < 180 KB |
| Tap → score persisted locally | < 50 ms |
| Marking flow usable offline | 100% |

If a change breaks a budget, fix the change — not the budget.

## UI rules

- Touch targets never below 44 px; score buttons deliberately larger.
- Contrast ratio ≥ 7:1 (the screen is read in direct sunlight).
- The whole assessment reachable one-handed, thumb only.
- No destructive action without explicit confirmation.
- Swahili is a first-class interface language, not a late translation layer.
- Never invent a colour. Deep teal `#0d4a43`, mid teal `#12665b`, accent
  `#a35c00` for focus rings. Palette is in the prototype.

## Never do these

- Never log a trainee's phone number, e-mail, or marks.
- Never expose the Supabase service-role key to the browser.
- Never serve a report file from a public path — short-lived signed URLs only.
- Never add analytics or a third-party script.
- Never write "Standard Attained" — the verdict is **Competent / Not Competent**.
- Never let a client compute a published number.
- Never call a language model inside the marking or comment path.
- Never `git push --force` to a shared branch.

## When you finish a unit of work

Append to `MEMORY.md` using the entry format at the top of that file. One entry
per feature, decision, or bug fix. Then update the phase checkboxes in
`ROADMAP.md`.
