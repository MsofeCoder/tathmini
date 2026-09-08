import { describe, expect, it } from 'vitest';
import {
  formatAssessmentDate,
  reportDateLine,
  todayInEat,
  validateAssessmentDate,
} from './assessment-date';

describe('todayInEat', () => {
  it('is the East African calendar day, not the UTC one', () => {
    // 22:00 in Morogoro on the 8th is still 19:00 UTC on the 8th.
    expect(todayInEat(new Date('2026-09-08T19:00:00Z'))).toBe('2026-09-08');
  });

  /**
   * The case that would otherwise bite a supervisor filing the day's work in
   * the evening: 01:00 EAT on the 9th is 22:00 UTC on the 8th. Reading the UTC
   * date would offer yesterday as the default and call today "the future".
   */
  it('has already rolled over when UTC has not', () => {
    expect(todayInEat(new Date('2026-09-08T22:00:00Z'))).toBe('2026-09-09');
  });
});

describe('validateAssessmentDate', () => {
  const today = '2026-09-08';

  it('accepts today', () => {
    expect(validateAssessmentDate(today, today)).toEqual({ ok: true, value: today });
  });

  it('accepts a day in the past — the whole point of the field', () => {
    expect(validateAssessmentDate('2026-09-01', today)).toEqual({ ok: true, value: '2026-09-01' });
  });

  /**
   * Empty means "not recorded", and the report falls back to the submission
   * date. That is the honest state for every mark submitted before this field
   * existed, and it means clearing the box degrades to the old behaviour
   * rather than blocking a supervisor trying to file work.
   */
  it('treats empty as no date rather than an error', () => {
    expect(validateAssessmentDate('', today)).toEqual({ ok: true, value: null });
    expect(validateAssessmentDate('   ', today)).toEqual({ ok: true, value: null });
  });

  /**
   * Future dates were refused at first and the College asked for that to go:
   * some reports are dated to an official day — the end of the assessment
   * period — which is still ahead when the marks are filed.
   */
  it('accepts a date in the future, at the College’s request', () => {
    expect(validateAssessmentDate('2026-09-09', today)).toEqual({ ok: true, value: '2026-09-09' });
    expect(validateAssessmentDate('2026-12-01', today).ok).toBe(true);
  });

  it('still refuses a year mistyped forwards', () => {
    const result = validateAssessmentDate('2027-12-01', today);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain('more than a year ahead');
  });

  it('accepts exactly 365 days ahead, and refuses 366', () => {
    expect(validateAssessmentDate('2027-09-08', today).ok).toBe(true);
    expect(validateAssessmentDate('2027-09-09', today).ok).toBe(false);
  });

  it('refuses a year slip, the mistake this field will actually attract', () => {
    const result = validateAssessmentDate('2025-06-01', today);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain('more than a year ago');
  });

  /**
   * The boundary is 365 days inclusive, each way. Note what this does NOT
   * catch: a year mistyped on the exact anniversary is 365 days out and
   * passes. Tightening the window would catch it, at the cost of refusing a
   * supervisor filing genuinely old work — and a wrong date is visible on the
   * report, whereas a refused submission blocks marks.
   */
  it('accepts exactly 365 days back, and refuses 366', () => {
    expect(validateAssessmentDate('2025-09-08', today).ok).toBe(true);
    expect(validateAssessmentDate('2025-09-07', today).ok).toBe(false);
  });

  it('refuses a day that is not a real date', () => {
    expect(validateAssessmentDate('2026-02-31', today).ok).toBe(false);
    expect(validateAssessmentDate('2026-13-01', today).ok).toBe(false);
  });

  it('refuses anything that is not a date at all', () => {
    expect(validateAssessmentDate('last Monday', today).ok).toBe(false);
    expect(validateAssessmentDate('08/09/2026', today).ok).toBe(false);
  });
});

describe('formatAssessmentDate', () => {
  /**
   * Formatted from the string, never through `Date`: `new Date('2026-09-08')`
   * is midnight UTC, and rendering that anywhere west of Greenwich prints the
   * 7th. The report is a record OF a date, so it must print the date it was
   * given.
   */
  it('prints the day it was given, with no time-zone arithmetic', () => {
    expect(formatAssessmentDate('2026-09-08')).toBe('08/09/2026');
    expect(formatAssessmentDate('2026-01-01')).toBe('01/01/2026');
  });
});

describe('reportDateLine', () => {
  it('prints the assessment date when there is one', () => {
    expect(reportDateLine('2026-09-01', '2026-09-03T10:00:00Z')).toBe('01/09/2026');
  });

  /** Every mark submitted before migration 0034 carries no date. */
  it('falls back to the submission date when there is not', () => {
    expect(reportDateLine(null, '2026-09-03T10:00:00Z')).toBe('03/09/2026');
  });

  it('prints an em dash when there is neither', () => {
    expect(reportDateLine(null, null)).toBe('—');
  });

  it('prefers the assessment date even when both are present and differ', () => {
    // The supervisor observed the lesson on the 1st and submitted on the 3rd;
    // the report must say the 1st. This is the whole feature in one assertion.
    expect(reportDateLine('2026-09-01', '2026-09-03T10:00:00Z')).not.toBe('03/09/2026');
  });
});
