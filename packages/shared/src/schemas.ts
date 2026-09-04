import { z } from 'zod';

/**
 * Shared client/server validation for a single criterion mark. This is the
 * ONE definition of "a valid assessment" AGENTS.md requires — both the
 * offline client and the server import this file, never a re-derived copy.
 *
 * Deliberately generic: the concrete instrument/criteria lists (TP Theory,
 * TP Practical, IPT) are NOT hard-coded here yet. Two of the three verbatim
 * forms have unresolved numbering defects (see MEMORY.md) that must be
 * confirmed before criteria are seeded — guessing at a renumbering here
 * would violate AGENTS.md's "never renumber a section" rule.
 */

/** TP Theory / TP Practical: points-scale criterion, 0..max in 0.5 steps. */
export function pointsCriterionMarkSchema(max: number) {
  return z
    .object({
      criterionId: z.string().min(1),
      score: z
        .number()
        .min(0)
        .max(max)
        .refine((v) => Number.isInteger(v * 2), 'Score must be in steps of 0.5'),
      comment: z.string().trim().optional(),
    })
    .refine((mark) => mark.score >= max / 2 || (mark.comment?.length ?? 0) > 0, {
      message: 'Comment required when the score is below half the maximum',
      path: ['comment'],
    });
}

/**
 * IPT: 1–5 rating scale, no zero option. Comment required at 3 or below
 * (PLAN.md 0.4 "comment trigger ... or ≤ 3 on IPT").
 */
export const iptCriterionMarkSchema = z
  .object({
    criterionId: z.string().min(1),
    score: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    comment: z.string().trim().optional(),
  })
  .refine((mark) => mark.score > 3 || (mark.comment?.length ?? 0) > 0, {
    message: 'Comment required when the score is 3 or below',
    path: ['comment'],
  });

export type PointsCriterionMark = z.infer<ReturnType<typeof pointsCriterionMarkSchema>>;
export type IptCriterionMark = z.infer<typeof iptCriterionMarkSchema>;

/**
 * Gating: a submission is complete only when every criterion the instrument
 * defines has been scored — never a partial count (PLAN.md 0.2 "complete-form
 * check"). Call with the instrument's known criterion ids and the ids that
 * were actually scored.
 */
export function assertComplete(expectedCriterionIds: string[], scoredCriterionIds: string[]) {
  const scored = new Set(scoredCriterionIds);
  const missing = expectedCriterionIds.filter((id) => !scored.has(id));
  return {
    complete: missing.length === 0,
    missing,
  };
}
