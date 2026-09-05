/**
 * The submit contract shared by the marking form, the server action that
 * performs the two-insert, and the offline outbox that replays it. Types
 * and pure decision logic only — no Supabase, no Dexie — so both a Server
 * Action and a client component can import it without dragging the other
 * one's runtime along.
 */

export interface SubmitItemInput {
  criterionId: string;
  score: number;
  comment: string;
}

/** One comment against a whole criterion — the TP forms' merged COMMENTS
 * cell. Empty comments are dropped before submission rather than stored as
 * blank rows. */
export interface SubmitSectionCommentInput {
  sectionCode: string;
  comment: string;
}

export interface SubmitAssessmentInput {
  traineeId: string;
  instrumentId: string;
  instrumentCode: string;
  slot: 'a1' | 'a2';
  criteria: { id: string; itemMax: number }[];
  items: SubmitItemInput[];
  /** TP only — the IPT form has no per-criterion comments column. */
  sectionComments: SubmitSectionCommentInput[];
  /** SUPERVISOR'S GENERAL COMMENTS. Optional on both tracks. */
  generalComment: string;
}

/**
 * `already_submitted` is the idempotency signal: a queued submission whose
 * first attempt actually reached the database before the response was lost
 * comes back as this on replay, and must be treated as done — not retried
 * forever, and never re-inserted (assessment_marks is unique per
 * trainee/instrument/slot and append-only).
 */
export type SubmitFailureCode =
  'signed_out' | 'incomplete' | 'invalid' | 'already_submitted' | 'server';

export type SubmitAssessmentResult =
  { ok: true } | { ok: false; code: SubmitFailureCode; error: string };

export type DrainOutcome = 'submitted' | 'retry';

/**
 * Whether a replayed submission can leave the outbox. Deliberately
 * conservative: only a real success or the idempotent already-submitted
 * case clears an entry. Everything else — including a payload the server
 * calls invalid, which the client's own gate should have made
 * unreachable — stays queued rather than being silently dropped, because
 * dropping it would discard marks a supervisor already typed in the field.
 */
export function drainOutcomeFor(result: SubmitAssessmentResult): DrainOutcome {
  if (result.ok) return 'submitted';
  return result.code === 'already_submitted' ? 'submitted' : 'retry';
}
