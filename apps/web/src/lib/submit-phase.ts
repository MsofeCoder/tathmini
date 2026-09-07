import { clearDraft } from './drafts';
import { db } from './db';
import { enqueueSubmission } from './outbox';
import { isReachable } from './reachability';
import type { SubmitAssessmentInput } from './submission';
import { submitAssessment } from '@/app/actions/submit-assessment';

/**
 * Sending ONE instrument's completed statement — the step the TP stepper
 * repeats once per phase.
 *
 * Deliberately the same three-way outcome the single-instrument form has
 * always had, in the same order, because that order is what protects a
 * supervisor's work:
 *
 *   1. ask whether the server is genuinely reachable (`navigator.onLine` is
 *      true on a workshop wifi that routes nowhere);
 *   2. if it is not, or the call throws mid-flight, the marks go to the
 *      outbox rather than being lost — the draft stays until the outbox
 *      confirms the send;
 *   3. only a REJECTION (the server answered, and said no) is surfaced as an
 *      error, because that is the only case a retry cannot fix.
 *
 * TP is two instruments but one visit, so the stepper calls this twice. Each
 * call is a separate statement under its own draft key, exactly as before:
 * nothing here merges two phases into one submission, and the database's
 * per-(trainee, instrument, slot) unique index and
 * `validate_and_finalize_mark()` are untouched. A half-sent TP assessment —
 * Theory accepted, Practical queued — is a state the system already handles,
 * and is strictly better than dropping either half.
 */
export type PhaseSubmitOutcome =
  { kind: 'sent' } | { kind: 'queued' } | { kind: 'rejected'; error: string };

export interface SubmitPhaseInput {
  key: string;
  payload: SubmitAssessmentInput;
  traineeName: string;
  instrumentLabel: string;
}

export async function submitPhase({
  key,
  payload,
  traineeName,
  instrumentLabel,
}: SubmitPhaseInput): Promise<PhaseSubmitOutcome> {
  if (!(await isReachable())) {
    await enqueueSubmission({ key, payload, traineeName, instrumentLabel });
    return { kind: 'queued' };
  }

  let result;
  try {
    result = await submitAssessment(payload);
  } catch {
    await enqueueSubmission({ key, payload, traineeName, instrumentLabel });
    return { kind: 'queued' };
  }

  if (!result.ok) return { kind: 'rejected', error: result.error };

  await clearDraft(key);

  // Record the submitted mark on the device immediately rather than waiting
  // for Realtime or the next sync to tell us what we just did — the
  // supervisor lands back on the profile expecting "Submitted ✓". The next
  // sync overwrites this row with the server's own.
  await db.marks.put({
    key,
    traineeId: payload.traineeId,
    instrumentId: payload.instrumentId,
    submittedAt: new Date().toISOString(),
  });

  return { kind: 'sent' };
}
