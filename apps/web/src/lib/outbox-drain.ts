import type { OutboxRecord, ReportOutboxRecord } from './db';
import {
  drainOutcomeFor,
  type SubmitAssessmentInput,
  type SubmitAssessmentResult,
} from './submission';

/**
 * The drain pass, lifted out of OutboxDrainer so the one invariant the whole
 * offline design rests on can be tested.
 *
 * ROADMAP.md's Phase 1 exit gate: "reconnecting produces exactly one
 * submission, never two." That is the rule a supervisor's work depends on in a
 * workshop with no signal, and until now it lived inside a React component and
 * was verified by nobody — the manual field test has never been run.
 *
 * These types are all `import type`, so nothing here pulls Dexie or a server
 * action into a test process. Every effect is injected, which is what makes
 * "exactly one submission" something a test can assert rather than something a
 * person has to go outside and check.
 *
 * NOT a substitute for the browser test. This proves the ordering and the
 * bookkeeping; it does not exercise IndexedDB, the service worker, or a real
 * connection dropping mid-request. Run the field test as well.
 */

/** Just enough of generateReport's result to decide the queue's next move. */
export type ReportAttemptResult = { error: string } | { url: string };

export interface DrainDeps {
  /** Entries whose backoff has elapsed — see outbox.ts. */
  listDue: () => Promise<OutboxRecord[]>;
  submit: (payload: SubmitAssessmentInput) => Promise<SubmitAssessmentResult>;
  removeQueued: (key: string) => Promise<void>;
  recordAttempt: (key: string, error: string) => Promise<void>;
  clearDraft: (key: string) => Promise<void>;

  listQueuedReports: () => Promise<ReportOutboxRecord[]>;
  generateReport: (traineeId: string) => Promise<ReportAttemptResult>;
  removeQueuedReport: (key: string) => Promise<void>;
  recordReportAttempt: (key: string, error: string) => Promise<void>;
}

export interface DrainResult {
  submitted: number;
  sent: number;
}

export async function drainOutbox(deps: DrainDeps): Promise<DrainResult> {
  let submitted = 0;

  for (const record of await deps.listDue()) {
    let result: SubmitAssessmentResult;
    try {
      result = await deps.submit(record.payload);
    } catch {
      // Still no usable connection despite the browser saying otherwise.
      // Abandon the pass rather than burning an attempt on every entry:
      // everything stays queued for the next one, marks intact.
      break;
    }

    if (drainOutcomeFor(result) === 'submitted') {
      // Remove BEFORE clearing the draft, and only ever after the server has
      // confirmed. `already_submitted` counts as confirmation — it means a
      // previous attempt did reach the database and only the response was
      // lost, so re-sending would be the double submission this exists to
      // prevent.
      await deps.removeQueued(record.key);
      await deps.clearDraft(record.key);
      submitted += 1;
    } else if (!result.ok) {
      // Stays queued. The marks a supervisor typed are never dropped because
      // the server disliked the payload.
      await deps.recordAttempt(record.key, result.error);
    }
  }

  // Reports drain AFTER the marks, and only in the same pass, because a report
  // is built from marks the server must already hold. The other order fails
  // every attempt with "submit your assessment first".
  let sent = 0;
  for (const report of await deps.listQueuedReports()) {
    let result: ReportAttemptResult;
    try {
      result = await deps.generateReport(report.key);
    } catch {
      break;
    }

    if ('error' in result) {
      await deps.recordReportAttempt(report.key, result.error);
      continue;
    }

    // The report is stored and recorded server-side by this point. Whether the
    // e-mail itself went is not this queue's business: re-generating would
    // store a second copy of an append-only document.
    await deps.removeQueuedReport(report.key);
    sent += 1;
  }

  return { submitted, sent };
}
