/**
 * Which rows are test data.
 *
 * Written as a tested predicate because getting it slightly wrong has real
 * consequences and has happened: a narrower regex than this one missed
 * TEST-IPT-0001/0002, and two rows seeded by migration 0011 have a NULL
 * registration_number — in SQL, `null ~ '^TEST-'` is null, not false, so a
 * regex-only filter silently skips them. Route membership catches those.
 *
 * The four shapes, all of which this covers:
 *   TEST-TP-nnnn   · TEST-IPT-nnnn  · anything on the route coded
 *   'TEST ROUTE'   · null registration number on that route
 */
export interface TestTraineeInput {
  registrationNumber: string | null | undefined;
  routeCode: string | null | undefined;
}

export const TEST_ROUTE_CODE = 'TEST ROUTE';

export function isTestTrainee({ registrationNumber, routeCode }: TestTraineeInput): boolean {
  if (routeCode === TEST_ROUTE_CODE) return true;
  if (!registrationNumber) return false;
  return /^TEST-(TP|IPT)-/i.test(registrationNumber.trim());
}

/**
 * The equivalent SQL, kept beside the predicate so the two cannot drift and
 * so the console can show an administrator exactly what a bulk clean-up
 * would delete. Not executed from the app: `delete on trainees` is revoked
 * from `authenticated` at the GRANT level (0001_rls_and_functions.sql), which
 * is deliberate — a trainee delete cascades to that trainee's marks.
 */
export const TEST_TRAINEE_DELETE_SQL = `delete from trainees
where registration_number ~ '^TEST-(TP|IPT)-'
   or route_id in (select id from routes where code = 'TEST ROUTE');`;
