# CONTEXT — Tathmini

Everything an agent needs to know about the *problem*. Rules for working live in
`AGENTS.md`; the phase plan lives in `ROADMAP.md`.

## What this is

A digital assessment sheet for **Morogoro Vocational Teachers' Training College
(MVTTC)**, Tanzania — part of VETA (Vocational Education and Training Authority).

Supervisors travel to vocational training centres and industrial sites to assess
student teachers against the official VETA assessment forms. Today this is done
on paper, which means marks are lost, arithmetic is wrong, reports arrive weeks
late, and a disputed grade cannot be reconstructed.

Tathmini replaces the paper form with a phone the supervisor already owns. It
must work with no network, because the trainees are in villages.

## Who uses it

| Role | Who | What they do | Share of use |
|---|---|---|---|
| **Supervisor** | ~20 college tutors | Assess trainees in the field. The real user. | ~100% of daily use |
| **Coordinator** | TP Coordinator | Sees the whole admin dashboard, read-only. Downloads Excel results. | Weekly |
| **Super Admin** | Msofe Coder (maintainer), Aron Franco | Accounts, routes, overrides, exports, backups. | Occasional |

There is **no self-registration**. Accounts are created by a Super Admin with a
set password. Usernames are `firstname.lastname`.

## The domain, in the College's own words

- **TP** — Teaching Practice. Assessed on **two** instruments: Theory (classroom,
  50 pts) and Practical (workshop, 50 pts). Total 100.
- **IPT** — Industrial Practical Training. **One** instrument, 70 pts, scored on a
  1–5 rating scale (1 Poor · 2 Fair · 3 Good · 4 Very Good · 5 Excellent).
- **Trainee** — the student teacher being assessed. Also called *candidate* on the
  printed form.
- **Route** — the set of trainees one supervisor travels to.
- **Assessor slot** — every trainee is assessed **independently by two assessors**
  (`a1`, `a2`). The official mark is the **average of both**.
- **Competent / Not Competent** — the verdict. VETA does **not** use "Standard
  Attained". Threshold is **50%**.

### Grading key (verbatim from the form)

| Grade | Range | Word | Class of Award | GPA |
|---|---|---|---|---|
| A | 80–100% | Excellent | First Class | 3.5–4.0 |
| B | 65–79% | Very Good | Second Class | 3.0–3.4 |
| C | 50–64% | Good | Pass | 2.0–2.9 |
| D | 40–49% | Poor | — | — |
| F | 0–39% | Fail | — | — |

Candidates with A, B or C qualify for NTA Level 5.

## Decisions already made (do not relitigate)

These were settled with the College. Changing any of them needs the user's
explicit approval, not an agent's judgement.

| Decision | Answer |
|---|---|
| Data residency | Managed Supabase, **`af-south-1` Cape Town**. Not Tanzania-hosted. |
| Super Admin may correct a mark? | **Yes** — but only as a *superseding revision* with a typed reason. Original stays visible forever. Never an in-place edit. |
| Two assessors far apart? | **Just average.** No flagging, no third assessor, no divergence threshold. |
| Trainee accounts? | **None.** TP trainees receive their PDF by e-mail. IPT trainees receive SMS only, never e-mail — the real registers show why: the TP register captures an e-mail address per trainee and no phone; the IPT register captures a phone number and no e-mail. Gate the channel by track, don't offer a channel the College has no data for. |
| GPS stamp at submission? | **Never build it.** The College declined it as staff surveillance. |
| Result retention | 24 months of archives for VETA audit. |
| Assessor independence | Assessor 2 must not be able to see Assessor 1's marks before both submit. Enforce in the database. |

## Where the facts live

Three things that are **not** where an agent reading the database would expect,
each of which has already caused a wrong diagnosis. Check here before
concluding a feature is broken.

### The Coordinator's address is configuration, not a user row

`RESULT_COORDINATOR_EMAIL`, read by
`apps/web/src/lib/notifications/recipients.ts`. There is deliberately **no
coordinator account** to look up, and creating one would not help.

`users_select` (migration 0001) is `id = auth.uid() or is_coordinator() or
is_super_admin()`, so a supervisor cannot read any other user's row. Resolving
the Coordinator from the database would need a `SECURITY DEFINER` lookup or a
widened policy exposing every staff address to every supervisor — a large
change to obtain one address. A role mailbox in configuration also survives a
staff change without a redeploy, which is what the College asked for when they
said roles rather than individuals.

*An agent queried the database on 2026-09-05, found zero coordinators, and
reported result e-mail as broken. It was not.*

### `users.email` is a credential; `users.contact_email` is the mailbox

`users.email` mirrors `auth.users.email` — it is the synthetic
`firstname.lastname@tathmini.internal` identifier that `usernameToEmail()`
builds and `signInWithPassword()` authenticates against. Nothing is ever sent
to it, and it is UNIQUE.

A supervisor's real, reachable address lives in `users.contact_email`
(migration 0017), which is nullable and unconstrained: most accounts have none,
and two people may share a family address.

**Never write a real address to `users.email`.** Migration 0022 did, reached
production, and 0027 undid it. Sign-in did not break — only the `public.users`
mirror was touched, never `auth.users` — but the mirror disagreed with auth,
and the UNIQUE constraint would have collided on the next account sync.

### IPT results are e-mailed — to the assessor, not the trainee

| Track | To | Cc | Bcc |
|---|---|---|---|
| TP | the trainee | the assessor | the Coordinator |
| IPT | **the assessor** | **the Coordinator** | — |

It is IPT *trainees* who are never e-mailed, because the IPT register holds a
phone number and no address (see the trainee-accounts decision above). The
report still goes out; it is filed with the people responsible for it. The
Coordinator moves from Bcc to Cc on IPT because with no trainee on the message
there is nothing to keep the copy blind from.

## Non-negotiables

1. **The supervisor owns the assessment decision.** The system awards no marks.
   It records them, applies the VETA key, and refuses incomplete forms.
2. **Authorisation lives in Postgres RLS, not React.** Hiding a button is a
   courtesy; a row-level policy is what stops the write.
3. **Submitted marks are append-only.** No `UPDATE` grant on marks for any role.
4. **Totals, grade, GPA and verdict are computed server-side.** Never trusted
   from a client payload.
5. **The marking flow works with the radio off.** Offline is the default case,
   not a degraded mode.
6. **The printed report reproduces the VETA form** field for field — same
   sections, same maxima, same COMPETENT / NOT COMPETENT tick boxes, same
   signature lines.
7. **No language model in the marking path.** Auto-comment advice is a static,
   versioned phrase bank so the Academic Board can review it and it works
   offline.

## Field reality that shapes the design

- Mid-range Android, 3G or no signal, held one-handed, in a noisy workshop,
  sometimes in bright sun.
- Supervisors are subject experts, not app users. One screen, one thing to tap.
- A supervisor may be unable to reach a trainee — sickness, distance, transport.
  Reassignment to a peer is a first-class flow, not an edge case.
- Battery death mid-assessment must lose nothing.

## The English register

Copy is written in **simple Tanzanian institutional English** — courteous,
direct, no idiom. Trainee notifications are in **Swahili**, personalised from
the trainee's own record. Both registers exist in the prototype; match them.

Auto-comment advice is imperative and practical: *"Involve every trainee, not
only those who raise their hands. Use group work and direct questions."* Never
"excellent", "very good", "fair" — the form explicitly forbids grade-words as
comments.

## Reference material in this repo

| File | What it is |
|---|---|
| `reference/Tathmini.dc.html` | The working prototype. The behavioural spec — when unsure how a flow should feel, read it. |
| `reference/Tathmini Result Report.dc.html` | The printed report, already matching the VETA forms. Port this markup. |
| `reference/Tathmini Technical Architecture.dc.html` | Stack rationale, security posture, backup design, risk register. |
| `reference/Tathmini Demo Guide.dc.html` | Stakeholder run-of-show and FAQ. Useful for copy tone. |
| `reference/forms/` | Extracted text of the three real VETA forms. **Criterion wording must be verbatim from these.** |
| `reference/0001_tathmini_init.sql` | First-pass schema from the prototype era. Treat as a sketch, not truth. |

## Glossary

- **VETA** — Vocational Education and Training Authority (the national regulator).
- **MVTTC** — Morogoro Vocational Teachers' Training College.
- **VTC** — Vocational Training Centre (where TP happens).
- **NTA Level 5** — the qualification level this assessment feeds.
- **TC-TVTE** — the teacher-education programme trainees are enrolled in.
- **Annex IV** — the paper form schedule this assessment derives from.
- **Outbox** — the local queue holding submissions until there is signal.
