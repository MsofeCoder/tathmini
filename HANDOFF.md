# HANDOFF — 8 September 2026, evening

Disposable briefing. Read `AGENTS.md` and `CONTEXT.md` first; this says only
what is true right now and what is owed next.

> ## The system is live and in use
>
> The College went live on **Monday 7 September 2026**. Supervisors are marking
> real trainees against production, results are locking, and reports are
> reaching real people. There is no deadline left to race — the risk has
> changed shape, from _will it ship_ to _what breaks while people depend on it_.
>
> Every earlier version of this file counted down to the evening of Sunday
> 6 September. That is done. Older `MEMORY.md` entries still carry the old
> dates because that file is append-only; this line is the live one.

## What is true today

Shipped, deployed and used for real:

- Supervisors mark TP (Theory and Practical) and IPT, online and offline, and
  submit. Nothing leaves a phone unless somebody presses a button — the
  automatic drainer was deliberately removed (#50).
- Two assessors' marks average into a locked result; reports generate and go to
  the right people by e-mail.
- The administration console corrects the register, moves trainees and slots,
  voids an assessment, and shows the standing health checks.
- **Correction requests are switched on** (migrations `0030` + `0032`, applied
  8 September). A supervisor reports a wrong particular from the field; an
  administrator applies or declines it, and the decision is on the record.
- **The date of assessment** is set by the supervisor before submitting and
  printed on the report instead of the submission date (`0034`, applied
  8 September).
- **The College holds its own copy of the data.** `/admin/maintenance` exports
  all 17 tables as CSVs with a manifest and per-file SHA-256, beside the
  existing report-PDF archive.
- **There is a way for users to say what is wrong** — an anonymous bilingual
  feedback form, linked from Account → Send feedback and shared on WhatsApp.
- A **Coordinator account** exists (`hoe.lymo`) and sign-in routes it correctly.

## What is owed, in order

**1 · Sign in as the Coordinator.** `/coordinator` and the read-only `/admin`
were built, deployed and have _never carried a real coordinator session_. The
role has existed since migration `0000`. This is one sign-in and it is the
oldest unproven thing in the project.

**2 · The offline exit gate, on a real phone.** Airplane mode, mark, force-quit,
reopen, reconnect. Owed since 6 September and still owed. Its shape changed
when #50 deleted the outbox drainer — nothing now sends on its own, so the
question is no longer "exactly one submission?" but "does the supervisor still
have their marks, and can they send them?". Offline is the normal case in a
workshop.

**3 · The four trainee pairs sharing an e-mail address.** Each would receive the
other's marks, and result e-mail is live. This has been the most urgent item in
the register since 6 September. It is now easier than it was: the supervisors
standing in front of those trainees can report the wrong address themselves,
and it arrives in the Requests tab.

**4 · Confirm the test rows are gone.** Migration `0029` exists; whether it was
applied live has not been confirmed in writing anywhere.

**5 · Decide on the Supabase Pro plan.** The project is on the **Free plan: no
automatic backups, no point-in-time recovery.** The CSV export narrows the hole
— the College can now reconstruct the assessment — but it cannot restore a
database, and a copy exists only when somebody presses the button. This is a
purchasing decision, not an engineering one.

## Cut — deliberately not being built

Each is real work the College will want. None is required for a supervisor to
mark and for a result to reach the right person.

- **SMS to IPT trainees.** 155 people are told nothing at all. The largest
  functional gap in the product. The IPT _assessor_ receives the report by
  e-mail, which is what the College needs on the day.
- **Swahili interface strings.** Phase 4. Note the feedback form is already
  bilingual, so criticism can arrive in Kiswahili before the interface does.
- **TOTP on the two administrator accounts.**
- **Excel export, the result-override screen, trainee deletion from the
  console.** Deletion needs a reviewed migration: `delete on trainees` is
  revoked from every signed-in role because it cascades to marks.
- **The supervisor-initiated reassignment flow** (request → accept/decline). The
  administrator's half is built; the inert `/moves` tab was removed and returns
  when the supervisor's half lands.
- **The backup panel proper** — status, 30-day calendar, restore-rehearsal
  record. The download half exists; the panel does not.

## Traps that have already caught someone

**Never write a real address to `users.email`.** It is the sign-in identifier
mirroring `auth.users.email`. Migration 0022 did this; 0027 undid it. Reachable
addresses live in `users.contact_email`, which is what the console edits.

**The Coordinator is now both a user row and configuration.** `hoe.lymo` holds
the role, but result e-mail still goes to `RESULT_COORDINATOR_EMAIL` in
`lib/notifications/recipients.ts` — deliberately, because a supervisor cannot
read the Coordinator's `users` row and widening `users_select` would expose
every staff address to every supervisor. Creating the account changed nothing
about who receives what.

**`hoe.lymo` is spelled correctly.** It reads like a typo for "hope" or "joe"
and it is not. It is the sign-in identifier mirroring `auth.users.email`;
"correcting" it locks the Coordinator out.

**Migration order can matter more than the migration.** `0030` declares
`reason text not null` while the deployed supervisor form sends `reason: null`.
Applied without `0032` it would have switched correction requests on _broken_ —
the tab lit up and Postgres refusing every report from the field. Read what the
running application actually sends before applying anything.

**A new column can break a deployment in either direction.** `0034` is written
so the app works whether or not it has been applied: the insert and the report
read both retry without the column. Supervisors are marking right now, and a
deployment that fails every submission until a migration is run loses a day's
work in the field.

**Do not renumber the migrations.** Their order encodes dependencies, and a
number is not yours until its branch is on `main`. `0034` is the last one; the
next is `0035`. The journal guard in `packages/db` will catch a migration added
without being registered — it already has.

**Match `trainees.name` verbatim, double spaces included.** Six names carry them
(`'EMMANUEL  MAKANTA'`). A whitespace-normalised join key silently missed
exactly those six in migration 0023, and the Supabase grid renders HTML so the
defect is invisible on screen.

**A submitted mark cannot be reassigned.** It belongs to the assessor who made
it. The console refuses a route move or a slot hand-over once a mark is in.

**Format the whole repo before pushing, and read the exit code.** `74a7f38` went
straight to `main` unformatted and left CI red on every branch cut from it
afterwards. Piping `pnpm format:check` into another command hides its exit code
and reports a false pass.

**Deadline pressure does not waive `AGENTS.md`.** Migrations, RLS, auth and
anything touching a stored mark still need the user's explicit approval, and the
service-role key still never enters the deployed application.
