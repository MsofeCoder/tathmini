import { describe, expect, it } from 'vitest';
import { averageTotals, classOfAward, evaluate, gpaFor, gradeFor } from './grading';

describe('averageTotals — two assessor slots (PLAN.md 0.4)', () => {
  it('averages (79.0, 76.0) to 77.5', () => {
    expect(averageTotals([79.0, 76.0])).toBe(77.5);
  });

  it('is the raw value with one submitted slot (provisional)', () => {
    expect(averageTotals([76.0])).toBe(76.0);
  });
});

describe('gradeFor — boundary cases (PLAN.md 0.4)', () => {
  it.each([
    [39.9, 'F'],
    [40, 'D'],
    [49.9, 'D'],
    [50, 'C'],
    [64.9, 'C'],
    [65, 'B'],
    [79.9, 'B'],
    [80, 'A'],
    [100, 'A'],
  ] as const)('%s%% -> %s', (pct, grade) => {
    expect(gradeFor(pct)).toBe(grade);
  });
});

describe('classOfAward', () => {
  it('awards First/Second/Pass for A/B/C and nothing for D/F', () => {
    expect(classOfAward('A')).toBe('First Class');
    expect(classOfAward('B')).toBe('Second Class');
    expect(classOfAward('C')).toBe('Pass');
    expect(classOfAward('D')).toBeNull();
    expect(classOfAward('F')).toBeNull();
  });
});

describe('gpaFor', () => {
  it('has no GPA for D or F', () => {
    expect(gpaFor(45, 'D')).toBeNull();
    expect(gpaFor(20, 'F')).toBeNull();
  });

  it('is bounded within each grade band', () => {
    expect(gpaFor(80, 'A')).toBeGreaterThanOrEqual(3.5);
    expect(gpaFor(100, 'A')).toBeLessThanOrEqual(4.0);
    expect(gpaFor(65, 'B')).toBeGreaterThanOrEqual(3.0);
    expect(gpaFor(50, 'C')).toBeGreaterThanOrEqual(2.0);
  });
});

describe('evaluate', () => {
  it('flags competent at exactly 50%', () => {
    expect(evaluate(50, 100).competent).toBe(true);
    expect(evaluate(49, 100).competent).toBe(false);
  });

  it('rounds GPA to one decimal', () => {
    const { gpa } = evaluate(90, 100);
    expect(gpa).toBe(Math.round((gpa ?? 0) * 10) / 10);
  });
});
