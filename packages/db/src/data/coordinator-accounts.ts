/**
 * The College's Assessment Coordinator — the one account that holds the
 * `coordinator` role.
 *
 * The role has been modelled since migration 0001 and the screens have
 * existed since PR #40, but no account ever held it: all 31 live accounts
 * are `supervisor` or `super_admin`, so `/coordinator` and the read-only
 * rendering of `/admin` have never been opened by the person they were
 * built for. This file is that account.
 *
 * **A coordinator can read everything and write nothing.** `is_coordinator()`
 * (0001_rls_and_functions.sql) appears in the USING clause of every select
 * policy — users, routes, trainees, marks, results, revisions, notifications,
 * the audit log — and in no INSERT or UPDATE policy anywhere. So this account
 * needs no grant of its own, and giving it one would be the mistake: the
 * read-only guarantee is a property of the policies, not of the console
 * hiding buttons.
 *
 * Two things this account is deliberately NOT:
 *
 * - **It is not where result e-mails go.** That stays `RESULT_COORDINATOR_EMAIL`
 *   in `apps/web/src/lib/notifications/recipients.ts` — configuration, so a
 *   staff change does not need a redeploy, and so a supervisor never has to
 *   read the Coordinator's `users` row to address a report. Creating this
 *   account changes nothing about who receives what.
 * - **It is not a shared role mailbox.** A named person, like every other
 *   account, so the audit log names a human.
 *
 * As everywhere else, `email` is a synthetic sign-in identifier on a domain
 * that does not resolve — never a mailbox. A reachable address, if the
 * Coordinator wants one on file, goes in `users.contact_email` through the
 * admin console. Writing a real address into `email` breaks sign-in; that is
 * what migration 0022 did and 0027 had to undo.
 */

import type { AccountSeed } from './ipt-accounts';

function account(username: string, name: string): AccountSeed {
  return { username, name, role: 'coordinator', email: `${username}@tathmini.internal` };
}

/**
 * Already live. Created directly in Supabase on 2026-09-08 at 01:09 UTC —
 * the Auth identity and the `users` row both — so `create:accounts` reports
 * this one as `skipped_existing`, which is the correct and only safe answer.
 *
 * It is written down anyway, because the live database is not the record: a
 * restore rehearsal, a scratch database or a fresh environment builds itself
 * from these seeds and the migrations, and an account that exists only in
 * production is an account that quietly disappears the first time the College
 * needs its backups. Migration 0033 is the same statement for the `users` row.
 */
// "hoe.lymo" is correct and confirmed by the user — not a typo for "hope" or
// "joe", and not to be tidied up. It is the sign-in identifier mirroring
// auth.users.email, so a well-meaning correction here would lock the
// Coordinator out rather than rename anything.
export const COORDINATOR_ACCOUNTS: AccountSeed[] = [account('hoe.lymo', 'Lymo')];
