import type { ReportTrainee } from '@/lib/reports/data';

/**
 * Who receives a result report. The College settled this 2026-09-05, and the
 * two tracks differ because the underlying registers differ:
 *
 *   TP    To  the trainee   Cc  the assessor   Bcc the Coordinator
 *   IPT   To  the assessor  Cc  the Coordinator
 *
 * IPT trainees are never in an e-mail at all — the IPT register captures a
 * phone number and no e-mail address, and the College's standing decision
 * (CONTEXT.md, "Trainee accounts?") is that IPT trainees are notified by SMS
 * only. So an IPT result is filed with the people responsible for it rather
 * than sent to its subject, which is why the Coordinator moves from Bcc to Cc
 * there: with no trainee on the message there is nothing to keep the copy
 * blind from, and an open Cc lets assessor and Coordinator reply to each other.
 *
 * The Coordinator address is configuration, not a lookup. A supervisor cannot
 * read the Coordinator's `users` row — `users_select` (migration 0001) is
 * `id = auth.uid() or is_coordinator() or is_super_admin()` — and widening
 * that policy would expose every staff address to every supervisor to solve a
 * one-address problem. A role mailbox in configuration also survives a staff
 * change without a redeploy, which is what the College asked for.
 */

/** The Coordinator's standing copy: Bcc on a TP result, Cc on an IPT one --
 * hence the neutral name rather than either header. */
export const COORDINATOR_ENV = 'RESULT_COORDINATOR_EMAIL';

/**
 * Accounts seeded by the roster imports (migrations 0007/0008) carry a
 * placeholder login identity on this domain, not a mailbox — `users.email` is
 * `NOT NULL`, so the imports had to put something there. The domain does not
 * resolve, so anything addressed to it bounces, and a steady stream of bounces
 * is exactly what gets a consumer Gmail sending account rate-limited or
 * suspended. Treat these as "no address on file" rather than sending to them.
 *
 * Migration 0022 gives 18 accounts their real mailboxes. Ten assessors keep
 * the placeholder until a Super Admin fills theirs in, and that is a safe
 * resting state precisely because this check exists: the address is inert
 * rather than bouncing.
 */
const PLACEHOLDER_DOMAIN = '@tathmini.internal';

export function isRealAddress(address: string | null | undefined): boolean {
  const trimmed = address?.trim();
  if (!trimmed) return false;
  return !trimmed.toLowerCase().endsWith(PLACEHOLDER_DOMAIN);
}

export interface ResultRecipients {
  to: readonly string[];
  cc: readonly string[];
  bcc: readonly string[];
}

export type RecipientsOutcome =
  | { ok: true; recipients: ResultRecipients }
  /** Nothing to send, and that is correct — a record with no usable address.
   * The caller reports "the report was saved but not e-mailed" and carries on;
   * this is not an error to retry. */
  | { ok: false; reason: 'not-emailable'; detail: string }
  /** A misconfiguration the College must fix. The send must not proceed. */
  | { ok: false; reason: 'unconfigured'; detail: string };

/**
 * Builds the recipient set for one result e-mail.
 *
 * `assessorEmail` comes from the caller's own `users` row — readable under
 * `users_select` because `id = auth.uid()` — never from a client payload.
 *
 * Refuses to send when the Coordinator mailbox is unset rather than quietly
 * sending without it. A result that reached the trainee but never reached the
 * College is an incomplete audit trail, and the person who needed it is the
 * one who will not know to ask.
 */
export function resolveResultRecipients(
  trainee: Pick<ReportTrainee, 'track' | 'email'>,
  assessorEmail: string | null,
  env: Readonly<Record<string, string | undefined>> = process.env,
): RecipientsOutcome {
  const coordinator = env[COORDINATOR_ENV]?.trim();
  if (!coordinator) {
    return {
      ok: false,
      reason: 'unconfigured',
      detail: `${COORDINATOR_ENV} is not set, so the Coordinator would not receive their copy.`,
    };
  }

  const assessor = isRealAddress(assessorEmail) ? assessorEmail!.trim() : null;

  if (trainee.track === 'IPT') {
    // The assessor is the To here, so without their address there is no
    // message at all — unlike TP, where a missing assessor address only costs
    // the Cc. This is why the Super Admin filling in the remaining supervisor
    // addresses matters more for IPT than for TP.
    if (!assessor) {
      return {
        ok: false,
        reason: 'not-emailable',
        detail: 'This assessor has no e-mail address on record.',
      };
    }
    return { ok: true, recipients: { to: [assessor], cc: [coordinator], bcc: [] } };
  }

  const traineeEmail = isRealAddress(trainee.email) ? trainee.email!.trim() : null;
  if (!traineeEmail) {
    return {
      ok: false,
      reason: 'not-emailable',
      detail: 'This trainee has no e-mail address on record.',
    };
  }

  return {
    ok: true,
    recipients: {
      // An assessor whose own address is still a placeholder is a data gap,
      // not a reason to withhold the trainee's result. Send with an empty Cc.
      to: [traineeEmail],
      cc: assessor ? [assessor] : [],
      bcc: [coordinator],
    },
  };
}
