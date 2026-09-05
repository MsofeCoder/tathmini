import { describe, expect, it } from 'vitest';
import {
  computeGaps,
  flaggedCriteria,
  sectionBelowHalf,
  criterionKindForInstrument,
  gate,
  groupBySection,
  isFlagged,
  isIptFlagged,
  isPointsFlagged,
  pointsScoreOptions,
  scoredCount,
  scoreOptionsFor,
  sectionSubtotal,
  type CriterionRow,
  type MarksByCriterion,
} from './marking';

const CRITERIA: CriterionRow[] = [
  {
    id: 'c1',
    sectionCode: '1',
    sectionLabel: 'LESSON PREPARATION',
    sectionMax: 2,
    itemCode: 'i',
    itemLabel: 'First',
    itemMax: 1,
    orderIndex: 1,
  },
  {
    id: 'c2',
    sectionCode: '1',
    sectionLabel: 'LESSON PREPARATION',
    sectionMax: 2,
    itemCode: 'ii',
    itemLabel: 'Second',
    itemMax: 1,
    orderIndex: 2,
  },
  {
    id: 'c3',
    sectionCode: '2',
    sectionLabel: 'SKILLS',
    sectionMax: 3,
    itemCode: 'i',
    itemLabel: 'Third',
    itemMax: 3,
    orderIndex: 3,
  },
];

describe('criterionKindForInstrument', () => {
  it('is ipt only for the ipt instrument code', () => {
    expect(criterionKindForInstrument('ipt')).toBe('ipt');
    expect(criterionKindForInstrument('tp_theory')).toBe('points');
    expect(criterionKindForInstrument('tp_practical')).toBe('points');
  });
});

describe('pointsScoreOptions', () => {
  it('produces 0..max in 0.5 steps', () => {
    expect(pointsScoreOptions(1)).toEqual([0, 0.5, 1]);
    expect(pointsScoreOptions(3)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3]);
  });
});

describe('scoreOptionsFor', () => {
  it('returns the fixed 1-5 scale for ipt regardless of itemMax', () => {
    expect(scoreOptionsFor('ipt', 5)).toEqual([1, 2, 3, 4, 5]);
  });
  it('delegates to pointsScoreOptions for points', () => {
    expect(scoreOptionsFor('points', 1)).toEqual([0, 0.5, 1]);
  });
});

describe('flag thresholds', () => {
  it('flags a points score below half the max, not at or above it', () => {
    expect(isPointsFlagged(1, 3)).toBe(true); // < 1.5
    expect(isPointsFlagged(1.5, 3)).toBe(false);
    expect(isPointsFlagged(2, 3)).toBe(false);
  });
  it('flags an ipt score of 3 or below, not 4+', () => {
    expect(isIptFlagged(3)).toBe(true);
    expect(isIptFlagged(4)).toBe(false);
  });
  it('isFlagged delegates by kind', () => {
    expect(isFlagged('ipt', 3, 5)).toBe(true);
    expect(isFlagged('points', 1, 3)).toBe(true);
    expect(isFlagged('points', 2, 3)).toBe(false);
  });
});

describe('groupBySection', () => {
  it('groups by section code, preserving order within and across sections', () => {
    const sections = groupBySection([CRITERIA[2]!, CRITERIA[0]!, CRITERIA[1]!]);
    expect(sections.map((s) => s.code)).toEqual(['1', '2']);
    expect(sections[0]!.criteria.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(sections[1]!.criteria.map((c) => c.id)).toEqual(['c3']);
  });
});

describe('sectionSubtotal / scoredCount', () => {
  const marks: MarksByCriterion = {
    c1: { score: 1, comment: '' },
    c2: { score: null, comment: '' },
  };
  it('sums only scored criteria, treating unscored as 0 for the running subtotal', () => {
    const [section1] = groupBySection(CRITERIA);
    expect(sectionSubtotal(section1!, marks)).toBe(1);
  });
  it('counts only criteria with a non-null score', () => {
    expect(scoredCount(CRITERIA, marks)).toBe(1);
  });
});

describe('gate', () => {
  it('is incomplete while any criterion is unscored, and lists exactly the missing ones', () => {
    const marks: MarksByCriterion = { c1: { score: 1, comment: '' } };
    const result = gate(CRITERIA, marks);
    expect(result.complete).toBe(false);
    expect(result.missing.map((c) => c.id)).toEqual(['c2', 'c3']);
  });
  it('is complete once every criterion has a score, including 0', () => {
    const marks: MarksByCriterion = {
      c1: { score: 0, comment: 'needs work' },
      c2: { score: 1, comment: '' },
      c3: { score: 3, comment: '' },
    };
    expect(gate(CRITERIA, marks).complete).toBe(true);
  });
});

describe('computeGaps', () => {
  it('reports unscored criteria', () => {
    const marks: MarksByCriterion = { c1: { score: 1, comment: '' } };
    const gaps = computeGaps(CRITERIA, marks);
    expect(gaps.map((g) => [g.criterion.id, g.reason])).toEqual([
      ['c2', 'unscored'],
      ['c3', 'unscored'],
    ]);
  });

  // The comment requirement was removed on 2026-09-05 - see the note on
  // computeGaps. A flagged sub-criterion with no comment must NOT block.
  it('does not block a below-half score that carries no comment', () => {
    const marks: MarksByCriterion = {
      c1: { score: 0, comment: '' }, // itemMax 1, 0 < 0.5 -> flagged
      c2: { score: 1, comment: '' },
      c3: { score: 3, comment: '' },
    };
    expect(computeGaps(CRITERIA, marks)).toEqual([]);
  });

  it('is empty once every criterion is scored', () => {
    const marks: MarksByCriterion = {
      c1: { score: 0, comment: 'weak' },
      c2: { score: 1, comment: '' },
      c3: { score: 3, comment: '' },
    };
    expect(computeGaps(CRITERIA, marks)).toEqual([]);
  });

  it('still blocks a zero-scored form where nothing is marked', () => {
    expect(computeGaps(CRITERIA, {})).toHaveLength(CRITERIA.length);
  });
});

describe('sectionBelowHalf', () => {
  const section = { code: '1', label: 'Lesson preparation', max: 5, criteria: CRITERIA };

  it('is true when the criterion total falls under half its maximum', () => {
    // 0 + 1 + 1 = 2 of 5
    expect(
      sectionBelowHalf(section, {
        c1: { score: 0, comment: '' },
        c2: { score: 1, comment: '' },
        c3: { score: 1, comment: '' },
      }),
    ).toBe(true);
  });

  it('is false at exactly half - the form says LESS than half', () => {
    // 1 + 1 + 0.5 = 2.5 of 5
    expect(
      sectionBelowHalf(section, {
        c1: { score: 1, comment: '' },
        c2: { score: 1, comment: '' },
        c3: { score: 0.5, comment: '' },
      }),
    ).toBe(false);
  });

  it('judges the criterion as a whole, not its weakest sub-criterion', () => {
    // c1 alone is flagged, but 0 + 1 + 3 = 4 of 5 is comfortably above half.
    expect(
      sectionBelowHalf(section, {
        c1: { score: 0, comment: '' },
        c2: { score: 1, comment: '' },
        c3: { score: 3, comment: '' },
      }),
    ).toBe(false);
  });
});

describe('flaggedCriteria', () => {
  it('lists the sub-criteria a suggestion would be offered for', () => {
    const flagged = flaggedCriteria('points', CRITERIA, {
      c1: { score: 0, comment: '' },
      c2: { score: 1, comment: '' },
      c3: { score: 1, comment: '' },
    });
    expect(flagged.map((c) => c.id)).toEqual(['c1', 'c3']);
  });

  it('ignores unscored criteria - nothing to advise on yet', () => {
    expect(flaggedCriteria('points', CRITERIA, {})).toEqual([]);
  });
});
