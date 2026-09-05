'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { clearDraft } from '@/lib/drafts';
import { listDue, recordAttempt, removeQueued } from '@/lib/outbox';
import { drainOutcomeFor } from '@/lib/submission';
import { submitAssessment } from './actions/submit-assessment';

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
 * Each pass takes only the entries whose exponential backoff has elapsed
 * (see outbox.ts). Without that, a submission failing for a reason a retry
 * cannot fix would be re-sent on every one of the many `online` events a
 * flapping signal produces.
 */
export function OutboxDrainer() {
  const router = useRouter();
  const draining = useRef(false);

  const drain = useCallback(async () => {
    // A concurrent pass could double-submit the same entry between its
    // insert and its removal from the queue.
    if (draining.current || !navigator.onLine) return;
    draining.current = true;
    try {
      let submitted = 0;
      // Only entries whose backoff has elapsed. A submission failing for a
      // reason no retry can fix must not be re-sent on every signal flap.
      for (const record of await listDue()) {
        let result;
        try {
          result = await submitAssessment(record.payload);
        } catch {
          // Still no usable connection despite navigator.onLine — abandon
          // this pass and leave everything queued for the next one.
          break;
        }
        if (drainOutcomeFor(result) === 'submitted') {
          await removeQueued(record.key);
          // Only now is the draft genuinely safe to discard.
          await clearDraft(record.key);
          submitted += 1;
        } else if (!result.ok) {
          await recordAttempt(record.key, result.error);
        }
      }
      if (submitted > 0) router.refresh();
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
