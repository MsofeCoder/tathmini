import { groupBySection, type CriterionRow, type MarksByCriterion } from './marking';
import type { DraftState } from './drafts';
import type { SubmitAssessmentInput } from './submission';

/**
 * Submitting a TP assessment, from wherever the supervisor happens to be
 * standing when it becomes complete.
 *
 * TP is two instruments, each marked on its own. Neither one leads into the
 * other: the profile is the pre-assessment page, and Theory and Practical are
 * two doors off it that can be opened in either order, on different days, in
 * either state of completeness. Leaving a lesson SAVES it — the draft is
 * already on the device — and returns to that page.
 *
 * Submission is therefore not the end of a walk; it is a thing that becomes
 * possible once every criterion of every unsubmitted phase carries a score.
 * At that moment the Save button at the end of a lesson, and a button on the
 * profile itself, both become Submit. This module is what both of them ask,
 * so the two can never disagree about whether the work is finished.
 *
 * Everything here is pure, and stays pure: the send itself lives in
 * `submit-phase.ts` beside `submitPhase`, because that module reaches the
 * server action and cannot be imported by a unit test. What decides whether
 * an assessment may be sent is exactly what a test must be able to pin down.
 */

export interface TpSubmitPhase {
  instrumentId: string;
  code: string;
  /** "TP Theory" / "TP Practical", for the outbox's own copy. */
  label: string;
  criteria: CriterionRow[];
}

/** Every criterion of this phase carries a score. Zero is a score; absent is
 * not, and is never treated as zero. */
export function phaseComplete(criteria: CriterionRow[], marks: MarksByCriterion): boolean {
  return criteria.length > 0 && criteria.every((c) => marks[c.id]?.score != null);
}

/**
 * Whether the whole TP assessment is ready to send: every phase still to be
 * marked is fully scored. Phases already submitted are not in the list, so a
 * supervisor finishing Practical alone is ready as soon as Practical is.
 */
export function tpReadyToSubmit(
  phases: TpSubmitPhase[],
  drafts: Record<string, DraftState | undefined>,
): boolean {
  return (
    phases.length > 0 &&
    phases.every((phase) => phaseComplete(phase.criteria, drafts[phase.instrumentId]?.marks ?? {}))
  );
}

export function buildPhasePayload({
  traineeId,
  slot,
  phase,
  draft,
}: {
  traineeId: string;
  slot: 'a1' | 'a2';
  phase: TpSubmitPhase;
  draft: DraftState;
}): SubmitAssessmentInput {
  return {
    traineeId,
    instrumentId: phase.instrumentId,
    instrumentCode: phase.code,
    slot,
    criteria: phase.criteria.map((c) => ({ id: c.id, itemMax: c.itemMax })),
    items: phase.criteria.map((c) => ({
      criterionId: c.id,
      score: draft.marks[c.id]!.score!,
      comment: draft.marks[c.id]?.comment ?? '',
    })),
    sectionComments: groupBySection(phase.criteria).map((section) => ({
      sectionCode: section.code,
      comment: draft.sectionComments[section.code] ?? '',
    })),
    generalComment: draft.generalComment,
  };
}
