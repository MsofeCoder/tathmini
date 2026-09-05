# HANDOFF — 5 September 2026, evening

Disposable briefing. Read `AGENTS.md` and `CONTEXT.md` first; this only says
where the work stands tonight and what will bite you.

**The College uses this in the field on Monday.** Everything below is ordered
by what that needs.

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

| | |
|---|---|
| `0022` | Supervisor addresses — **superseded and wrong**, see traps |
| `0023` + `0026` | TP roster at the College's FINAL VERSION, all 364 trainees |
| `0024` | 42 test trainees, three on each of the 14 real routes |
| `0025` | `assessment_mark_section_comments` + `assessment_marks.general_comment` |
| `0027` | Restores `users.email`, moves real addresses to `contact_email` |

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

## Do this next

1. **Merge #25 and deploy.** Everything else waits on it.
2. **Get 9 supervisor contact addresses** into `users.contact_email`. The six
   IPT ones are blocking: on IPT the assessor is the **To**, so their reports
   cannot send at all. On TP a missing address only costs the Cc.
3. **One end-to-end test** from a `TEST` trainee to a real inbox.
4. **Then** clean up the test trainees — the corrected query is below.
5. **Still unproven: the offline outbox in a real browser.** Go offline, mark,
   submit, reconnect, confirm *exactly one* row lands. This is Phase 1's exit
   gate in `ROADMAP.md` and the whole reason the app is built this way. It has
   never been done.

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
IPT *trainees* who are never e-mailed, because their register holds a phone and
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
it is not a no-op. **Run it only after the end-to-end test**, and before any
real marking starts on those routes: 43 of the 46 sit on real routes, so
supervisors will otherwise see fake trainees in their lists on Monday.

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
