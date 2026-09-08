import { describe, expect, it } from 'vitest';
import { dataHealthChecks, failingChecks, severityStyle, worstSeverity } from './health';

const clear = {
  testTrainees: 0,
  staffMissingContactEmail: 0,
  duplicateTraineeEmails: 0,
  routesMissingSupervisor: 0,
  traineesWithoutAssignment: 0,
  duplicateTraineeNames: 0,
  pendingCorrections: 0,
};

describe('dataHealthChecks', () => {
  it('reports nothing failing when the register is clean', () => {
    expect(failingChecks(dataHealthChecks(clear))).toEqual([]);
    expect(worstSeverity(dataHealthChecks(clear))).toBeNull();
  });

  it('carries the counts it was given', () => {
    const checks = dataHealthChecks({ ...clear, testTrainees: 46 });
    const testCheck = checks.find((c) => c.id === 'test-trainees');
    expect(testCheck?.count).toBe(46);
    expect(testCheck?.severity).toBe('urgent');
  });

  it('treats leftover test rows and shared trainee addresses as urgent', () => {
    expect(worstSeverity(dataHealthChecks({ ...clear, testTrainees: 1 }))).toBe('urgent');
    expect(worstSeverity(dataHealthChecks({ ...clear, duplicateTraineeEmails: 1 }))).toBe('urgent');
  });

  it('treats a missing staff address as worth fixing, not urgent', () => {
    expect(worstSeverity(dataHealthChecks({ ...clear, staffMissingContactEmail: 10 }))).toBe(
      'warn',
    );
  });

  it('lets an urgent check outrank a warning', () => {
    const checks = dataHealthChecks({
      ...clear,
      staffMissingContactEmail: 10,
      testTrainees: 46,
      duplicateTraineeNames: 5,
    });
    expect(worstSeverity(checks)).toBe('urgent');
    expect(failingChecks(checks)).toHaveLength(3);
  });

  it('reports a shared name as information only', () => {
    expect(worstSeverity(dataHealthChecks({ ...clear, duplicateTraineeNames: 5 }))).toBe('info');
  });

  it('gives every check a stable id and a link to act on it', () => {
    const checks = dataHealthChecks(clear);
    expect(new Set(checks.map((c) => c.id)).size).toBe(checks.length);
    expect(checks.every((c) => c.href?.startsWith('/admin/'))).toBe(true);
  });
});

describe('severityStyle', () => {
  it('has a distinct treatment per severity', () => {
    const styles = (['urgent', 'warn', 'info'] as const).map(severityStyle);
    expect(new Set(styles.map((s) => s.bg)).size).toBe(3);
  });
});

describe('pending corrections', () => {
  it('is clear when nothing is waiting, so a quiet queue adds no noise', () => {
    expect(failingChecks(dataHealthChecks(clear)).map((c) => c.id)).not.toContain(
      'pending-corrections',
    );
  });

  /**
   * Urgent on purpose. A correction request is usually a wrong e-mail address,
   * and result e-mail is live — every day it waits is a day a trainee's marks
   * can reach the wrong person.
   */
  it('is urgent, and links to the tab that decides it', () => {
    const check = dataHealthChecks({ ...clear, pendingCorrections: 3 }).find(
      (c) => c.id === 'pending-corrections',
    );
    expect(check?.count).toBe(3);
    expect(check?.severity).toBe('urgent');
    expect(check?.href).toBe('/admin/requests');
  });

  it('raises the page to urgent on its own', () => {
    expect(worstSeverity(dataHealthChecks({ ...clear, pendingCorrections: 1 }))).toBe('urgent');
  });
});
