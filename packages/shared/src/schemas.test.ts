import { describe, expect, it } from 'vitest';
import { assertComplete, iptCriterionMarkSchema, pointsCriterionMarkSchema } from './schemas';
// Imported a second time under a different local name, per PLAN.md 0.4:
// "the same import path used in both [client and server]; one test imports
// it twice" — this stands in for the client/server duplication until the
// server package exists.
import { iptCriterionMarkSchema as iptSchemaServerSide } from './schemas';

describe('pointsCriterionMarkSchema', () => {
  const schema = pointsCriterionMarkSchema(6);

  it('accepts a full-max score with no comment', () => {
    expect(schema.safeParse({ criterionId: 'c1', score: 6 }).success).toBe(true);
  });

  it('accepts 0.5-step scores at or above half the maximum', () => {
    expect(schema.safeParse({ criterionId: 'c1', score: 4.5 }).success).toBe(true);
  });

  it('rejects a step that is not a multiple of 0.5, independent of the comment rule', () => {
    // 4.3 is above half (3) so the comment-required refinement would not
    // itself reject it — this isolates the step-size check.
    expect(schema.safeParse({ criterionId: 'c1', score: 4.3 }).success).toBe(false);
  });

  // The comment requirement was removed on 2026-09-05. A below-half score
  // still raises an auto-comment SUGGESTION (isFlagged, apps/web marking.ts),
  // but the supervisor decides whether to write one - the paper form gives a
  // criterion one merged COMMENTS cell, not one per sub-criterion, and the
  // prototype gates only on every criterion being scored.
  it('accepts a below-half score with no comment', () => {
    expect(schema.safeParse({ criterionId: 'c1', score: 2 }).success).toBe(true);
  });

  it('accepts a below-half score with a comment', () => {
    expect(
      schema.safeParse({ criterionId: 'c1', score: 2, comment: 'Needs more practice.' }).success,
    ).toBe(true);
  });

  it('accepts a zero with no comment - the lowest score is not a special case', () => {
    expect(schema.safeParse({ criterionId: 'c1', score: 0 }).success).toBe(true);
  });
});

describe('iptCriterionMarkSchema', () => {
  it('rejects 0 — the IPT scale has no zero option', () => {
    expect(iptCriterionMarkSchema.safeParse({ criterionId: 'i1', score: 0 }).success).toBe(false);
  });

  it('accepts 3 or below with no comment', () => {
    expect(iptCriterionMarkSchema.safeParse({ criterionId: 'i1', score: 1 }).success).toBe(true);
    expect(iptCriterionMarkSchema.safeParse({ criterionId: 'i1', score: 3 }).success).toBe(true);
    expect(
      iptCriterionMarkSchema.safeParse({ criterionId: 'i1', score: 3, comment: 'Below average.' })
        .success,
    ).toBe(true);
  });

  it('accepts a score above 3 with no comment', () => {
    expect(iptCriterionMarkSchema.safeParse({ criterionId: 'i1', score: 4 }).success).toBe(true);
  });

  it('is the same schema imported under a second name (client/server share one definition)', () => {
    expect(iptSchemaServerSide).toBe(iptCriterionMarkSchema);
  });
});

describe('assertComplete', () => {
  it('refuses a submission missing even one criterion', () => {
    const result = assertComplete(['a', 'b', 'c'], ['a', 'b']);
    expect(result.complete).toBe(false);
    expect(result.missing).toEqual(['c']);
  });

  it('accepts a submission scoring every criterion', () => {
    expect(assertComplete(['a', 'b'], ['b', 'a']).complete).toBe(true);
  });
});
