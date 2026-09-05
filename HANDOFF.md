# HANDOFF — 5 September 2026, evening

Disposable briefing. Read `AGENTS.md` and `CONTEXT.md` first; this only says
where the work stands tonight and what will bite you.

> ## ⚠ DEADLINE: tomorrow, Sunday 6 September 2026, BEFORE LUNCH
>
> Not Monday. Earlier notes and older `MEMORY.md` entries say Monday — they are
> out of date and were written before the date moved. This is roughly **half a
> working day** from the evening of the 5th.

Everything below is ordered by what that deadline needs. The critical path is
short; most of what remains is optional and is marked so.

---

## Verify before you trust this

This file was accurate when written and will rot. Two agents worked this repo
today and both reported stale facts at least once. Before acting:

```bash
git fetch origin && git log --oneline -5 origin/main
gh pr list --state open
git ls-tree --name-only origin/main packages/db/migrations/ | tail -8
```

**The Supabase MCP in this session returns `Unauthorized`** — it cannot read
the database. Every database claim here came from queries the user ran in the
SQL editor and pasted back. Do the same rather than guessing, and never report
database state you have not seen.

---

## Where it stands

### Live in production (`azlwxriyhdshfhklonrx`)

Migrations **0022–0027 applied**, plus main's 0016/0017/0018. Specifically:

|                 |                                                                         |
| --------------- | ----------------------------------------------------------------------- |
| `0022`          | Supervisor addresses — **superseded and wrong**, see traps              |
| `0023` + `0026` | TP roster at the College's FINAL VERSION, all 364 trainees              |
| `0024`          | 42 test trainees, three on each of the 14 real routes                   |
| `0025`          | `assessment_mark_section_comments` + `assessment_marks.general_comment` |
| `0027`          | Restores `users.email`, moves real addresses to `contact_email`         |

Vercel env is set: `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_NAME`,
`RESULT_COORDINATOR_EMAIL=lyimos673@gmail.com`. Sending from
`mvttc.assessment@gmail.com` over Gmail SMTP.

**The e-mail path has sent successfully in production at least once** — the
user saw "Report saved and sent." against `msofedesigner@gmail.com`.

### On a branch, not yet merged

**PR #25** — `feat/result-email-and-criterion-comments`. Conflict-free as of
`bb19499`. It carries nearly everything from today:

- result e-mail on submit (`apps/web/src/lib/notifications/`)
- the TP roster parser rewrite (header-based column mapping)
- one comment per criterion, never compulsory
- auto-comment suggestions, ported from the prototype's 89-phrase bank
- the duplicate-send fix
- **PR #28 is already merged into this branch** — there is no ordering problem

Until #25 merges and deploys, **none of the e-mail or comment work is live**.

---

## The critical path — in this order, nothing skipped

Four steps. They are sequential: the test needs the deploy, and the cleanup
destroys what the test uses.

**1 · Merge #25 and deploy.** ~15 minutes. Until this lands, none of the
e-mail work, the criterion comments or the duplicate-send fix is live. It is
conflict-free as of `bb19499`. **#30 is hygiene — do not let it block this.**

**2 · One end-to-end e-mail test.** Sign in, open a `TEST TP R…` trainee, mark
**both** instruments, tap Submit and send report. Confirm the mail arrives.
This is the only step that proves the deploy actually works.

**3 · Delete the test trainees.** Query below. **This is not optional and it is
the most visible defect if missed** — 43 of the 46 sit on _real_ routes, so
every supervisor opening the app tomorrow sees fake trainees mixed into their
own list, and their progress counters are wrong by three.

**4 · Confirm a real trainee still looks right.** Open one real trainee on one
real route and check the particulars and counters. Two minutes, and it catches
a cleanup that took too much.

### What to drop if time runs out

- **The 9 missing supervisor addresses.** Marking is unaffected. TP reports
  still send, minus the assessor's Cc. Only the six IPT assessors genuinely
  cannot send a report — tell those six, and fix it next week.
- **PR #30** (migration guard, CONTEXT decisions). Pure hygiene.
- **The auto-comment**, if anything about it misbehaves. It is a suggestion
  layer; the comment boxes work without it.

### What NOT to drop

**The offline outbox test.** Go offline, mark, submit, reconnect, confirm
_exactly one_ row lands — never two, never zero. It has never been done, it is
Phase 1's exit gate in `ROADMAP.md`, and offline is the _normal_ case in a
workshop, not an edge case. If only one optional thing survives the morning,
make it this: a double-submitted or lost assessment is the one failure the
College cannot recover from in the field.

---

## Traps that have already caught someone today

**Never write a real address to `users.email`.** It is the sign-in identifier,
mirroring `auth.users.email`, which `usernameToEmail()` builds and
`signInWithPassword()` authenticates against. Migration 0022 did exactly this;
0027 undid it. Reachable addresses live in `users.contact_email`.

**The Coordinator is configuration, not a user row.** `RESULT_COORDINATOR_EMAIL`
(`lib/notifications/recipients.ts`). There is deliberately no coordinator
account: `users_select` means a supervisor cannot read another user's row, and
widening that to find one address would expose every staff address to every
supervisor. Another agent queried the database, found no coordinator, and
declared the feature broken. It is not.

**IPT reports do go by e-mail** — To the assessor, Cc the Coordinator. It is
IPT _trainees_ who are never e-mailed, because their register holds a phone and
no address.

**Do not renumber the migrations again.** They were renumbered once, to
0022–0027, after three collisions with main. The order encodes dependencies:
0022 sets the addresses 0027 moves; 0023 imports the roster 0026 repairs.
Applying a fix before its subject silently does nothing.

**A migration number is not yours until its branch is on main.** Three
collisions today (0016, two 0017s, two 0018s) came from claiming numbers early.

**Match `trainees.name` verbatim, including double spaces.** Six names carry
them (`'EMMANUEL  MAKANTA'`). A whitespace-normalised join key silently missed
those six rows in 0023, and the Supabase results grid renders HTML, so the
defect is invisible on screen. Compare with
`regexp_replace(name, '\s+', ' ', 'g')` on **both** sides, or use the stored
form exactly.

**Every data migration ships with the query that proves it worked.** The above
was found only by counting rows afterwards.

---

## Test data cleanup

46 test trainees exist in four shapes. This covers all of them:

```sql
delete from trainees
where registration_number ~ '^TEST-(TP|IPT)-'
   or route_id in (select id from routes where code = 'TEST ROUTE');
```

A narrower regex misses `TEST-IPT-0001`/`0002` and the two rows from 0011 whose
`registration_number` is **null** (`null ~ '...'` is null, not true).

**This cascades to marks** — about 8 test marks. Fine, they are test marks, but
it is not a no-op. **Run it only after the end-to-end test** (step 2 above),
and before the College opens the app tomorrow morning: 43 of the 46 sit on
real routes, so every supervisor would otherwise find fake trainees in their
own list with their counters three too high.

---

## Known data defects the College must decide on

- **Pato Mohele.** `RAFAEL` and `RAPHAEL PATO MOHELE` are two Route 2 rows
  sharing one registration number, two e-mails and **the same phone number**.
  Almost certainly one person entered twice. `registration_number` is UNIQUE so
  only one holds it. Removing the duplicate is a Super Admin action — a trainee
  delete cascades to marks.
- **Two trainees share `rashidmujwahuzi@gmail.com`** (Mudabiru Mujwahuzi Musssa
  and Benard Tiago Raulenti). With result e-mail live, **each would receive the
  other's marks.** Fix one address before TP e-mail goes wide, or exclude them.
- **`CONTEXT.md` is out of date**: it says the TP register has no phone column.
  The FINAL VERSION carries 364 phone numbers. The channel decision is the
  College's, but the premise behind it has changed.

---

## Working with a second agent

Today's confusion was almost entirely one cause: two agents on one working tree
and one production database, with intent recorded only in code comments.

- Declare ownership of an area before starting. Contested today:
  `packages/db/migrations/`, `marking-form.tsx`, `lib/notifications/`.
- Do not re-do work another agent has offered to do. Duplicating is the failure
  being avoided.
- Put decisions where a cold agent looks — `CONTEXT.md`, not a code comment.
  The three at the top of "Traps" all belong there and are not yet written up.

Two agreed but unbuilt (nobody has started them):

1. A CI check failing the build on duplicate migration numbers or a missing
   journal entry. Ten lines, and it would have caught all three collisions.
2. A "Where the facts live" section in `CONTEXT.md` carrying the three
   decisions above.
