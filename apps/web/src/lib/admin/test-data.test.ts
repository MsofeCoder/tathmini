import { describe, expect, it } from 'vitest';
import { isTestTrainee, TEST_TRAINEE_DELETE_SQL } from './test-data';

describe('isTestTrainee', () => {
  it('matches both TP and IPT test registration numbers', () => {
    expect(isTestTrainee({ registrationNumber: 'TEST-TP-0003', routeCode: 'ROUTE 6' })).toBe(true);
    expect(isTestTrainee({ registrationNumber: 'TEST-IPT-0001', routeCode: 'ROUTE 2' })).toBe(true);
  });

  it('matches a row with NO registration number that sits on the test route', () => {
    // The two rows migration 0011 seeded. A regex alone misses them.
    expect(isTestTrainee({ registrationNumber: null, routeCode: 'TEST ROUTE' })).toBe(true);
    expect(isTestTrainee({ registrationNumber: undefined, routeCode: 'TEST ROUTE' })).toBe(true);
  });

  it('matches anything at all on the test route', () => {
    expect(isTestTrainee({ registrationNumber: 'MVTTC/2026/117', routeCode: 'TEST ROUTE' })).toBe(
      true,
    );
  });

  it('leaves real trainees alone', () => {
    expect(isTestTrainee({ registrationNumber: 'MVTTC/2026/117', routeCode: 'ROUTE 6' })).toBe(
      false,
    );
    expect(isTestTrainee({ registrationNumber: null, routeCode: 'ROUTE 6' })).toBe(false);
  });

  it('does not match a real number that merely contains the word test', () => {
    expect(isTestTrainee({ registrationNumber: 'CONTEST-TP-2026', routeCode: 'ROUTE 1' })).toBe(
      false,
    );
  });

  it('keeps the documented SQL in step with the predicate', () => {
    expect(TEST_TRAINEE_DELETE_SQL).toContain("'^TEST-(TP|IPT)-'");
    expect(TEST_TRAINEE_DELETE_SQL).toContain("code = 'TEST ROUTE'");
  });
});
