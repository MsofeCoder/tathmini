'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { clearDraft } from '@/lib/drafts';
import { listDue, recordAttempt, removeQueued } from '@/lib/outbox';
import { drainOutbox } from '@/lib/outbox-drain';
import { listQueuedReports, recordReportAttempt, removeQueuedReport } from '@/lib/report-outbox';
import { submitAssessment } from './actions/submit-assessment';
import type { ReportAttemptResult } from '@/lib/outbox-drain';

/**
 * Replays queued submissions when connectivity comes back. Mounted once in
 * the root layout so it runs wherever the supervisor happens to be — they
 * should never have to return to a particular screen to make their marks
 * send.
 *
 * Retries on the browser's own `online` event and on regaining focus, NOT the
 * Background Sync API. Renders nothing; what is waiting is shown on the
 * Pending tab and on the offline screen.
 *
 * The pass itself lives in `lib/outbox-drain.ts` and is unit-tested there.
 * This component owns only what genuinely belongs to the browser: when to run,
 * and not running twice at once. ROADMAP.md's exit gate — "reconnecting
 * produces exactly one submission, never two" — is asserted against that
 * module rather than left to a manual check nobody has performed.
 */
/**
 * Posts to the route handler rather than calling the Server Action.
 *
 * An action inherits the `maxDuration` of the route that invoked it, and this
 * component runs from the root layout — usually on `/offline` or `/pending`,
 * which are client components and cannot declare one. Every queued report was
 * timing out there and silently staying queued. The handler carries its own
 * 60s budget.
 *
 * A transport failure THROWS, so drainOutbox leaves the entry queued: a 401 on
 * an expired session, or a dead connection, must never discard a supervisor's
 * pending report.
 */
async function requestReport(traineeId: string): Promise<ReportAttemptResult> {
  const response = await fetch(`/api/reports/${traineeId}`, { method: 'POST' });
  if (!response.ok) throw new Error(`Report request failed: ${response.status}`);
  return (await response.json()) as ReportAttemptResult;
}

export function OutboxDrainer() {
  const router = useRouter();
  const draining = useRef(false);

  const drain = useCallback(async () => {
    // A concurrent pass could double-submit the same entry between its
    // insert and its removal from the queue.
    if (draining.current || !navigator.onLine) return;
    draining.current = true;
    try {
      const { submitted, sent } = await drainOutbox({
        listDue,
        submit: submitAssessment,
        removeQueued,
        recordAttempt,
        clearDraft,
        listQueuedReports,
        generateReport: requestReport,
        removeQueuedReport,
        recordReportAttempt,
      });
      if (submitted > 0 || sent > 0) router.refresh();
    } finally {
      draining.current = false;
    }
  }, [router]);

  useEffect(() => {
    void drain();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void drain();
    };
    window.addEventListener('online', drain);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('online', drain);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [drain]);

  return null;
}
