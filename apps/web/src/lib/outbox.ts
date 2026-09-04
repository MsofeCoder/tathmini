import { db, type OutboxRecord } from './db';
import type { SubmitAssessmentInput } from './submission';

/**
 * The offline submit queue. HANDOFF.md's agreed cut for this sprint: plain
 * retry-on-reconnect, NOT the Background Sync API (which needs a registered
 * service worker event with real browser-support caveats). A submission that
 * cannot reach the server is stored here and replayed by OutboxDrainer when
 * the browser comes back online or the app regains focus.
 */

export interface EnqueueInput {
  key: string;
  payload: SubmitAssessmentInput;
  traineeName: string;
  instrumentLabel: string;
}

/**
 * Queues (or re-queues) a submission. Keyed per (trainee, instrument), so a
 * supervisor who re-marks the same assessment while the first attempt is
 * still queued replaces it rather than sending two — the same key the
 * database's own unique index enforces server-side.
 */
export async function enqueueSubmission({
  key,
  payload,
  traineeName,
  instrumentLabel,
}: EnqueueInput): Promise<void> {
  await db.outbox.put({
    key,
    payload,
    traineeName,
    instrumentLabel,
    queuedAt: Date.now(),
    attempts: 0,
    lastError: null,
  });
}

export async function listQueued(): Promise<OutboxRecord[]> {
  return db.outbox.toArray();
}

export async function removeQueued(key: string): Promise<void> {
  await db.outbox.delete(key);
}

/** Records a failed replay without dropping the entry — the marks stay safe on the device. */
export async function recordAttempt(key: string, error: string): Promise<void> {
  const record = await db.outbox.get(key);
  if (!record) return;
  await db.outbox.put({ ...record, attempts: record.attempts + 1, lastError: error });
}
