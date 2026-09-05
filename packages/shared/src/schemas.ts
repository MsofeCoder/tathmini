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

/**
 * Comments are NEVER required, on either scale.
 *
 * Both schemas used to reject a mark below the flag threshold unless it
 * carried a comment of its own, which forced the supervisor to write one
 * sentence per failing sub-criterion. Neither the VETA forms nor the
 * prototype ask for that. The paper form gives each CRITERION one merged
 * COMMENTS cell and the IPT form gives none at all, and the prototype gates
 * only on every criterion being scored — a below-half score there raises a
 * suggestion, never a block (College decision, 2026-09-05).
 *
 * The threshold itself is not gone; it moved. It still decides which
 * criteria offer an auto-comment suggestion (`isFlagged` in
 * apps/web/src/lib/marking.ts), and it is still what the printed form's
 * instruction refers to. What changed is that the supervisor decides whether
 * to write anything — CONTEXT.md's first non-negotiable: the supervisor owns
 * the assessment decision.
 */

/** TP Theory / TP Practical: points-scale criterion, 0..max in 0.5 steps. */
export function pointsCriterionMarkSchema(max: number) {
  return z.object({
    criterionId: z.string().min(1),
    score: z
      .number()
      .min(0)
      .max(max)
      .refine((v) => Number.isInteger(v * 2), 'Score must be in steps of 0.5'),
    comment: z.string().trim().optional(),
  });
}

/** IPT: 1–5 rating scale, no zero option. */
export const iptCriterionMarkSchema = z.object({
  criterionId: z.string().min(1),
  score: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  comment: z.string().trim().optional(),
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
