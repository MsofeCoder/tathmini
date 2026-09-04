import { describe, expect, it } from 'vitest';
import {
  IPT_CRITERIA,
  IPT_MAX_TOTAL,
  TP_PRACTICAL_CRITERIA,
  TP_PRACTICAL_MAX_TOTAL,
  TP_THEORY_CRITERIA,
  TP_THEORY_MAX_TOTAL,
  type CriterionSeed,
} from './criteria';

function sectionMaxima(criteria: CriterionSeed[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const c of criteria) map.set(c.sectionCode, c.sectionMax);
  return map;
}

function checkInstrument(criteria: CriterionSeed[], expectedTotal: number) {
  const sections = sectionMaxima(criteria);

  it('each section max equals the sum of its own items (PLAN.md 0.2)', () => {
    for (const [sectionCode, sectionMax] of sections) {
      const itemSum = criteria
        .filter((c) => c.sectionCode === sectionCode)
        .reduce((a, c) => a + c.itemMax, 0);
      expect(itemSum, `section ${sectionCode}`).toBeCloseTo(sectionMax, 5);
    }
  });

  it('section maxima sum to the instrument total (PLAN.md 0.2)', () => {
    const total = Array.from(sections.values()).reduce((a, v) => a + v, 0);
    expect(total).toBeCloseTo(expectedTotal, 5);
  });

  it('every item has a unique (sectionCode, itemCode) pair', () => {
    const keys = criteria.map((c) => `${c.sectionCode}.${c.itemCode}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
}

describe('TP Theory criteria', () => {
  checkInstrument(TP_THEORY_CRITERIA, TP_THEORY_MAX_TOTAL);

  it('has 41 items across 10 sections, matching reference/forms/TP Theory form.txt', () => {
    expect(TP_THEORY_CRITERIA).toHaveLength(41);
    expect(sectionMaxima(TP_THEORY_CRITERIA).size).toBe(10);
  });
});

describe('TP Practical criteria', () => {
  checkInstrument(TP_PRACTICAL_CRITERIA, TP_PRACTICAL_MAX_TOTAL);

  it('has 34 items across 5 sections, matching reference/forms/TP Practical form.txt', () => {
    expect(TP_PRACTICAL_CRITERIA).toHaveLength(34);
    expect(sectionMaxima(TP_PRACTICAL_CRITERIA).size).toBe(5);
  });

  it('section 2 has no duplicate item codes (source repeats "vii."; itemCode corrects the second to "viii." per user confirmation)', () => {
    const section2Codes = TP_PRACTICAL_CRITERIA.filter((c) => c.sectionCode === '2').map(
      (c) => c.itemCode,
    );
    expect(new Set(section2Codes).size).toBe(section2Codes.length);
    expect(section2Codes).toEqual(['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x']);
  });
});

describe('IPT criteria', () => {
  checkInstrument(IPT_CRITERIA, IPT_MAX_TOTAL);

  it('has 14 items across 6 sections, matching reference/forms/IPT assessment form.txt', () => {
    expect(IPT_CRITERIA).toHaveLength(14);
    expect(sectionMaxima(IPT_CRITERIA).size).toBe(6);
  });

  it('every item maxes at 5, the fixed 1–5 rating scale', () => {
    expect(IPT_CRITERIA.every((c) => c.itemMax === 5)).toBe(true);
  });
});
