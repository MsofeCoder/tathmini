# HANDOFF — 6 September 2026, midday

Disposable briefing. Read `AGENTS.md` and `CONTEXT.md` first; this only says what
must be true by tonight and what has been cut to get there.

> ## ⚠ DEADLINE: TONIGHT — the evening of Sunday 6 September 2026
>
> The system must be **production-ready this evening**. There is no time after
> it: the College uses the app for real assessment on Monday morning, and
> supervisors are already marking against production.
>
> The deadline has moved twice. Earlier notes saying **Monday 7 September** or
> **"Sunday before lunch"** are both dead — do not act on either. Older
> `MEMORY.md` entries carry the old dates because that file is append-only; this
> line is the live one.

## What "production-ready" means tonight

Only this, and nothing else counts:

1. A supervisor can sign in, mark a real trainee on both instruments, and submit
   — online and offline.
2. Two assessors' marks average into a locked result, and the report reaches the
   right people.
3. **The live register contains no fake data and no trainee who would receive
   another trainee's marks.**
4. Nothing a supervisor sees this morning has been broken by today's work.

Anything that does not serve those four is out of scope until next week, however
good an idea it is.

---

## The critical path, in order

**1 · Merge PR #37 and deploy.** The administration console. All checks green,
mergeable, no conflicts. It is already doing real work from the preview: staff
without a reachable e-mail dropped from 10 to 3 this morning because the console
was used to fix seven of them. Until it lands, every register correction is a
hand-written migration again.

**2 · Delete the 46 test trainees.** Not optional, and still not done. 43 sit on
_real_ routes, so every supervisor opening the app tomorrow sees fake trainees in
their own list with their counters three too high.

```sql
delete from trainees
where registration_number ~ '^TEST-(TP|IPT)-'
   or route_id in (select id from routes where code = 'TEST ROUTE');
```

Cascades to roughly 13 test marks — expected, not a no-op. A narrower regex
misses `TEST-IPT-0001`/`0002` and the two rows whose `registration_number` is
NULL (`null ~ '...'` is null, not true), which is why the route clause is there.

**Run it after any last end-to-end e-mail test, and after the test steps in the
console's test pass** — B1–B4 and C1/C5/C6 use those rows and will stop working
once they are gone.

**3 · Fix the four trainee pairs sharing an e-mail address.** Result e-mail is
live and 16 reports have been generated. Each pair would receive the other's
marks. This is the one defect that sends a real person the wrong result.
`/admin/trainees` → open → correct the address.

**4 · Confirm one real trainee still looks right.** One real route, one real
trainee: particulars, counters, both assessor names. Two minutes, and it catches
a clean-up that took too much.

**5 · Try one void, on a test row, in the browser.** `0031_void_trainee_assessment.sql`
was **applied live today**: an administrator can now return one assessed trainee
to "Not yet assessed" from `/admin/trainees/[id]`, archiving the whole
assessment into `voided_assessments` first, so a supervisor who marked the wrong
person is undone from the console instead of by a hand-written migration. The
database half is verified structurally and by 30 pgTAP assertions, but **the
happy path has never run against real data** — do one void on a `TEST-` row
before the test rows are purged, confirm the trainee reads "Not yet assessed"
and can be marked again, and that is this feature closed out. Note it does NOT
delete a trainee; `delete on trainees` is still revoked, and that is still cut.

**6 · Decide `0028_ipt_roster_final.sql`.** Still uncommitted. It moves 40 IPT
trainees between routes, which changes who assesses them. Marking has started, so
every hour it waits, more of those trainees become unmovable — the console
refuses to move anyone already marked, and the migration would not. Apply it
tonight or drop it; do not leave it in the working tree unresolved.

---

## Cut — deliberately not being built before Monday

Each of these is real work that the College will want. None of it is required for
a supervisor to mark and for a result to reach the right person.

- **SMS to IPT trainees.** 155 people are currently told nothing at all. The
  largest functional gap in the product, and still not a Monday blocker: the IPT
  _assessor_ receives the report by e-mail, which is what the College needs on
  the day.
- **Swahili interface strings.** Phase 4.
- **The backup panel and nightly encrypted `pg_dump`.** The first thing to build
  next week — until it exists, a bad afternoon loses the College's assessment
  records.
- **TOTP on the two administrator accounts.**
- **Excel export, the result-override screen, trainee deletion from the
  console.** Deletion needs a reviewed migration: `delete on trainees` is revoked
  from every signed-in role because it cascades to marks.
- **The supervisor-initiated reassignment flow** (request → accept/decline). The
  administrator's half is built; the inert `/moves` tab has now been removed
  from the bottom bar and returns when the supervisor-initiated half lands.
- **PR #2**, open since 4 September and long superseded. Close it.

---

## Verification still owed

- **The offline exit gate, on a real device.** Airplane mode, mark, force-quit,
  reopen, reconnect — exactly one submission lands, never two, never zero. There
  is an automated test; it has never been done on a phone. Offline is the normal
  case in a workshop, and a double-submitted or lost assessment is the one
  failure the College cannot recover from in the field. **If one optional thing
  survives tonight, make it this.**
- **Single-slot reassignment** (`/admin/trainees/[id]` → "Hand this slot to…").
  Deployed, never run: `reassignments` is still empty. Steps B4 and C6 of the
  test pass cover it.

---

## Traps that have already caught someone

**Never write a real address to `users.email`.** It is the sign-in identifier
mirroring `auth.users.email`. Migration 0022 did this; 0027 undid it. Reachable
addresses live in `users.contact_email`, which is what the console edits.

**The Coordinator is configuration, not a user row.** `RESULT_COORDINATOR_EMAIL`
in `lib/notifications/recipients.ts`. There is deliberately no coordinator
account, and widening `users_select` to find one would expose every staff address
to every supervisor.

**IPT reports do go by e-mail** — to the assessor, Cc the Coordinator. It is IPT
_trainees_ who are never e-mailed, because their register holds a phone and no
address.

**Do not renumber the migrations again.** Their order encodes dependencies, and a
number is not yours until its branch is on `main`.

**Match `trainees.name` verbatim, double spaces included.** Six names carry them
(`'EMMANUEL  MAKANTA'`). A whitespace-normalised join key silently missed exactly
those six in migration 0023, and the Supabase grid renders HTML so the defect is
invisible on screen.

**A submitted mark cannot be reassigned.** It belongs to the assessor who made
it. The console refuses a route move or a slot hand-over once a mark is in; that
is not a bug to work around tonight.

**Deadline pressure does not waive `AGENTS.md`.** Migrations, RLS, auth and
anything touching a stored mark still need the user's explicit approval, and the
service-role key still never enters the deployed application.
