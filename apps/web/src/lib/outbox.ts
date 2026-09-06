import { db, type OutboxRecord } from './db';
import type { SubmitAssessmentInput } from './submission';

/**
 * The offline submit queue. Deliberately NOT the Background Sync API, which
 * needs a registered service-worker event with real browser-support caveats:
 * a submission that cannot reach the server is stored here and replayed by
 * OutboxDrainer when the browser comes back online or the app regains focus.
 */

/** First retry waits this long. */
const BASE_DELAY_MS = 10_000;
/**
 * And never longer than this. A supervisor who walks back into coverage must
 * not wait a quarter of an hour for their marks to leave the phone, so the
 * curve is capped well before the delays get long enough to matter.
 */
const MAX_DELAY_MS = 5 * 60_000;

/**
 * How long to wait before retrying a submission that has failed `attempts`
 * times: 10s, 20s, 40s … capped at 5 minutes.
 *
 * ROADMAP.md Phase 1 asks for exponential backoff and it was previously the
 * unbuilt half of this queue — the drainer retried on every `online` event
 * and every focus change, with no delay at all. In the field that is not
 * theoretical: signal flaps constantly, each flap fires `online`, and a
 * submission failing for a reason a retry cannot fix (a validation error, a
 * revoked session) would be re-sent on every single flap for as long as the
 * supervisor kept working.
 *
 * Jittered by up to ±20%, because thirty supervisors coming back into
 * coverage at the same roadside would otherwise retry in lockstep.
 *
 * Deterministic when a `random` is supplied, which is how it is tested.
 */
export function backoffDelayMs(attempts: number, random: () => number = Math.random): number {
  if (attempts <= 0) return 0;
  const exponential = Math.min(BASE_DELAY_MS * 2 ** (attempts - 1), MAX_DELAY_MS);
  const jitter = 1 + (random() - 0.5) * 0.4;
  return Math.round(exponential * jitter);
}

/** Whether a queued submission is due to be retried. */
export function isDue(record: Pick<OutboxRecord, 'nextAttemptAt'>, now = Date.now()): boolean {
  // Records queued before backoff existed have no nextAttemptAt — they are
  // due immediately rather than stuck forever.
  return (record.nextAttemptAt ?? 0) <= now;
}

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
    // A fresh submission is sent on the very next drain, never delayed.
    nextAttemptAt: 0,
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
  const attempts = record.attempts + 1;
  await db.outbox.put({
    ...record,
    attempts,
    lastError: error,
    nextAttemptAt: Date.now() + backoffDelayMs(attempts),
  });
}

/** Queued submissions whose backoff has elapsed. */
export async function listDue(now = Date.now()): Promise<OutboxRecord[]> {
  return (await db.outbox.toArray()).filter((record) => isDue(record, now));
}
