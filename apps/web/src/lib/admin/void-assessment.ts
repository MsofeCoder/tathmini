/**
 * Voiding one trainee's assessment: the rules for whether it may be offered,
 * and for what the administrator is told before they confirm.
 *
 * Pure and tested, like `reassignment.ts`, because both ends need the same
 * answer — the page decides whether to draw the card, and the Server Action
 * re-decides at the moment the button is pressed, against figures it has just
 * re-read. A confirmation screen that was rendered ten minutes ago is not
 * evidence of what the register holds now.
 *
 * Nothing here deletes anything or computes a mark. The clearing is
 * `void_trainee_assessment()` in migration 0031, in one transaction, after it
 * has archived what it is about to clear.
 */

export interface VoidTarget {
  traineeName: string;
  track: 'TP' | 'IPT';
  /** Every `assessment_marks` row for this trainee, submitted or not. */
  markCount: number;
  /** Of those, the ones carrying `submitted_at`. */
  submittedMarkCount: number;
  /** `reports` rows — PDFs generated, and therefore probably sent. */
  reportCount: number;
  /** `results.locked_at`, or null. */
  lockedAt: string | null;
  /** Whether a `results` row exists at all. */
  hasResult: boolean;
}

export interface VoidPlan {
  /** One sentence naming what is about to be cleared. */
  summary: string;
  /** What the void does and does not do, in the order that matters. */
  consequences: string[];
  /**
   * The one thing a void cannot undo. Null when no report was ever generated,
   * so the warning stays meaningful on the occasions it appears.
   */
  sentReportWarning: string | null;
}

export type VoidDecision = { ok: true; plan: VoidPlan } | { ok: false; error: string };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Whether this trainee can be returned to "Not yet assessed", and what that
 * will take with it.
 *
 * A trainee with nothing submitted is already in that state, and voiding
 * "nothing" would file an archive row recording that nothing happened — so it
 * is refused here as well as in the function.
 */
export function planAssessmentVoid(target: VoidTarget): VoidDecision {
  if (target.markCount === 0 && !target.hasResult) {
    return {
      ok: false,
      error: `${target.traineeName} is already not assessed — there is nothing to void.`,
    };
  }

  const expected = target.track === 'TP' ? 4 : 2;
  const stage = target.lockedAt
    ? 'a locked result, with both assessors in'
    : target.submittedMarkCount > 0
      ? `${plural(target.submittedMarkCount, 'submitted mark')} of the ${expected} this trainee needs`
      : 'a started assessment with nothing submitted yet';

  const consequences = [
    `${target.traineeName} returns to “Not yet assessed”, and both assessors can mark them again from the beginning.`,
    `${plural(target.markCount, 'mark')} — every criterion score and comment with ${
      target.markCount === 1 ? 'it' : 'them'
    } — ${target.markCount === 1 ? 'is' : 'are'} copied to the void archive, then cleared.`,
  ];

  if (target.hasResult) {
    consequences.push(
      'The computed total, grade, GPA and Competent verdict are cleared. They are recomputed from scratch when the new marks arrive.',
    );
  }
  if (target.reportCount > 0) {
    consequences.push(
      `${plural(target.reportCount, 'report record')} ${
        target.reportCount === 1 ? 'is' : 'are'
      } archived and removed from this trainee. The PDF files themselves stay in storage — a report that has been sent is a thing that happened.`,
    );
  }

  consequences.push(
    'The register entry, the route and both assessor assignments are untouched. This does not delete the trainee.',
  );
  consequences.push('It cannot be undone from the console. The archive is the only copy.');

  return {
    ok: true,
    plan: {
      summary: `${target.traineeName} currently has ${stage}.`,
      consequences,
      sentReportWarning:
        target.reportCount > 0
          ? `${
              target.reportCount === 1
                ? 'A result report has'
                : `${target.reportCount} result reports have`
            } already been generated for ${target.traineeName}, which means the result has probably already been e-mailed. Voiding does not unsend it — whoever received it will need to be told the assessment is being done again.`
          : null,
    },
  };
}

/**
 * The label on the armed confirmation button. Names the figure rather than
 * asking "are you sure?", the same way the test-data purge does: the number is
 * what tells the administrator whether they are about to void the record they
 * think they are.
 */
export function voidConfirmLabel(target: VoidTarget): string {
  return `Yes, void ${plural(target.markCount, 'mark')} and return ${target.traineeName} to unassessed`;
}
