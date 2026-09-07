import { clearDraft } from './drafts';
import { isReachable } from './reachability';
import { listSendable, recordAttempt, removeQueued } from './outbox';
import { drainOutbox, type ReportAttemptResult } from './outbox-drain';
import { listQueuedReports, recordReportAttempt, removeQueuedReport } from './report-outbox';
import { removeReportDraft } from './report-drafts';
import { recordSentReport } from './sent-reports';
import { refreshReachability } from './local/use-reachable';
import type { SendPendingResult } from './send-pending-result';
import { submitAssessment } from '@/app/actions/submit-assessment';

/**
 * Sending whatever is still waiting on this phone — **only** when a
 * supervisor asks for it.
 *
 * This replaces `OutboxDrainer`, which ran this same pass automatically on
 * mount, on the browser's `online` event and on every return to the tab. That
 * behaviour is deliberately gone. The app no longer sends anything the
 * supervisor did not press a button for, at the user's instruction, and the
 * whole of the send path now follows one rule: **with no connection you can
 * save a draft, and nothing else; with a connection you can submit.**
 *
 * What that costs, said plainly so nobody has to rediscover it: ROADMAP.md's
 * Phase 1 exit gate — "reconnecting produces exactly one submission, never
 * two" — no longer describes the app. Reconnecting now produces NO
 * submissions. Marks and reports that reached a queue (a send that started on
 * a connection and lost it mid-flight is still possible, and still must not
 * throw work away) sit there until somebody opens Reports and taps Send. The
 * mitigations for that are in the UI, not here: the Reports tab carries a
 * live count of everything waiting, the Pending list says out loud that
 * nothing sends on its own, and the Send button is the first thing on it.
 *
 * What has NOT changed is the invariant underneath: exactly one submission,
 * never two. `drainOutbox` still removes an entry only after the server has
 * confirmed it, still treats `already_submitted` as confirmation, and still
 * drains marks before reports because a report is built from marks the server
 * must already hold. Making the trigger manual changes when the pass runs,
 * not what it guarantees — which is why the pass itself was left where it is,
 * with its tests.
 */

export { describeSendResult, type SendPendingResult } from './send-pending-result';

/**
 * Posts to the route handler rather than calling the Server Action.
 *
 * An action inherits the `maxDuration` of the route that invoked it, and this
 * runs from a client screen, which cannot declare one. Every queued report was
 * timing out that way and silently staying queued. The handler carries its own
 * 60s budget.
 *
 * A transport failure THROWS, so `drainOutbox` leaves the entry queued: a 401
 * on an expired session, or a dead connection, must never discard a
 * supervisor's pending report.
 */
async function requestReport(traineeId: string): Promise<ReportAttemptResult> {
  const response = await fetch(`/api/reports/${traineeId}`, { method: 'POST' });
  if (!response.ok) throw new Error(`Report request failed: ${response.status}`);
  return (await response.json()) as ReportAttemptResult;
}

/**
 * Guards against two passes at once. A concurrent pass could double-submit the
 * same entry between its insert and its removal from the queue — and now that
 * the trigger is a button, an impatient double-tap is the likeliest way to
 * cause it.
 */
let sending = false;

export async function sendPendingWork(): Promise<SendPendingResult> {
  if (sending) return { kind: 'busy' };

  // A real probe, not `navigator.onLine`, which is true on a workshop wifi
  // that routes nowhere. Refreshing rather than reading the cache: the
  // supervisor pressed this button because they believe they have signal now,
  // and a ten-second-old "offline" would tell them they are wrong without
  // looking.
  await refreshReachability();
  if (!(await isReachable())) return { kind: 'offline' };

  sending = true;
  try {
    const { submitted, sent } = await drainOutbox({
      // `listSendable`, not `listDue`: backoff is a defence against a retry
      // storm, and a person pressing Send is not one. See outbox.ts.
      listDue: listSendable,
      submit: submitAssessment,
      removeQueued,
      recordAttempt,
      clearDraft,
      listQueuedReports,
      generateReport: requestReport,
      // Clearing the held-back marker alongside the queue entry. Both are
      // keyed by trainee id, and a report that has actually gone out is not
      // "waiting for a person" any more — leaving the marker behind would list
      // a sent report as a draft forever.
      removeQueuedReport: async (key: string) => {
        await removeQueuedReport(key);
        await removeReportDraft(key);
      },
      recordReportAttempt,
      recordSentReport,
    });
    // No router.refresh(): every screen reads IndexedDB through liveQuery, so
    // removing an entry from the outbox re-renders the Reports lists and the
    // waiting count on its own.
    return { kind: 'done', submitted, sent };
  } finally {
    sending = false;
  }
}
