import { describe, expect, it } from 'vitest';
import { planAssessmentVoid, voidConfirmLabel, type VoidTarget } from './void-assessment';

function target(over: Partial<VoidTarget> = {}): VoidTarget {
  return {
    traineeName: 'ASHA JUMA',
    track: 'TP',
    markCount: 4,
    submittedMarkCount: 4,
    reportCount: 2,
    lockedAt: '2026-09-06T08:00:00.000Z',
    hasResult: true,
    ...over,
  };
}

describe('planAssessmentVoid', () => {
  it('refuses a trainee who is already not assessed', () => {
    const decision = planAssessmentVoid(
      target({
        markCount: 0,
        submittedMarkCount: 0,
        reportCount: 0,
        lockedAt: null,
        hasResult: false,
      }),
    );
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.error).toContain('already not assessed');
  });

  it('offers the void for a locked result and says so', () => {
    const decision = planAssessmentVoid(target());
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.plan.summary).toContain('a locked result');
    expect(decision.plan.consequences[0]).toContain('Not yet assessed');
  });

  it('counts a part-marked TP trainee against the four marks the track needs', () => {
    const decision = planAssessmentVoid(
      target({ markCount: 1, submittedMarkCount: 1, reportCount: 0, lockedAt: null }),
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.plan.summary).toContain('1 submitted mark of the 4');
  });

  it('counts an IPT trainee against two, not four — one instrument, two slots', () => {
    const decision = planAssessmentVoid(
      target({ track: 'IPT', markCount: 1, submittedMarkCount: 1, reportCount: 0, lockedAt: null }),
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.plan.summary).toContain('1 submitted mark of the 2');
  });

  it('allows a void where marks exist but nothing was submitted', () => {
    const decision = planAssessmentVoid(
      target({
        markCount: 1,
        submittedMarkCount: 0,
        reportCount: 0,
        lockedAt: null,
        hasResult: false,
      }),
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.plan.summary).toContain('nothing submitted yet');
  });

  it('allows a void where a result row survives with no marks — the state a half-done clean-up leaves', () => {
    const decision = planAssessmentVoid(
      target({ markCount: 0, submittedMarkCount: 0, reportCount: 0, lockedAt: null }),
    );
    expect(decision.ok).toBe(true);
  });

  it('warns that a generated report has probably already been sent', () => {
    const decision = planAssessmentVoid(target({ reportCount: 1 }));
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.plan.sentReportWarning).toContain('does not unsend it');
    expect(decision.plan.sentReportWarning).toContain('A result report has');
  });

  it('does not warn about reports when none was ever generated', () => {
    const decision = planAssessmentVoid(target({ reportCount: 0 }));
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.plan.sentReportWarning).toBeNull();
  });

  it('always says the register entry, route and assessors are untouched', () => {
    const decision = planAssessmentVoid(target({ reportCount: 0, hasResult: false }));
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.plan.consequences.join(' ')).toContain('does not delete the trainee');
  });

  it('mentions the cleared verdict only when a result exists', () => {
    const withResult = planAssessmentVoid(target());
    const withoutResult = planAssessmentVoid(target({ hasResult: false, lockedAt: null }));
    expect(withResult.ok && withResult.plan.consequences.join(' ')).toContain('Competent verdict');
    expect(withoutResult.ok && withoutResult.plan.consequences.join(' ')).not.toContain(
      'Competent verdict',
    );
  });
});

describe('voidConfirmLabel', () => {
  it('names the number of marks and the trainee', () => {
    expect(voidConfirmLabel(target())).toBe('Yes, void 4 marks and return ASHA JUMA to unassessed');
  });

  it('is singular for one mark', () => {
    expect(voidConfirmLabel(target({ markCount: 1 }))).toContain('void 1 mark and');
  });
});
