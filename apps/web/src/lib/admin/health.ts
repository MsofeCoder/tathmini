/**
 * The register defects that have actually bitten this project, expressed as
 * standing checks instead of queries somebody has to remember to run.
 *
 * Every one of these was found by hand at least once (see HANDOFF.md and
 * MEMORY.md): test rows left on real routes, staff with no reachable address,
 * two trainees sharing one inbox, a route with an empty assessor slot. They
 * are cheap to count and expensive to miss, so the console counts them on
 * every visit rather than waiting to be asked.
 *
 * Pure: the page does the counting, this decides what the counts mean.
 */
export type HealthSeverity = 'urgent' | 'warn' | 'info';

export interface HealthCheck {
  id: string;
  label: string;
  /** What it means and what to do — shown only when the count is non-zero. */
  detail: string;
  severity: HealthSeverity;
  count: number;
  href?: string;
}

export interface HealthInput {
  testTrainees: number;
  staffMissingContactEmail: number;
  duplicateTraineeEmails: number;
  routesMissingSupervisor: number;
  traineesWithoutAssignment: number;
  duplicateTraineeNames: number;
}

export function dataHealthChecks(input: HealthInput): HealthCheck[] {
  return [
    {
      id: 'test-trainees',
      label: 'Test trainees still in the register',
      detail:
        'Test rows sit on real routes, so supervisors see fake trainees in their own list and their counters read high. Delete them before the College opens the app.',
      severity: 'urgent',
      count: input.testTrainees,
      href: '/admin/trainees?q=TEST',
    },
    {
      id: 'duplicate-trainee-emails',
      label: 'Trainees sharing an e-mail address',
      detail:
        'Result e-mail is live. Two trainees on one address means each receives the other’s marks. Correct one address before results go out.',
      severity: 'urgent',
      count: input.duplicateTraineeEmails,
      href: '/admin/trainees',
    },
    {
      id: 'routes-missing-supervisor',
      label: 'Routes with an empty assessor slot',
      detail:
        'A route needs two assessors before its trainees can be marked twice and a result can lock.',
      severity: 'warn',
      count: input.routesMissingSupervisor,
      href: '/admin/routes',
    },
    {
      id: 'trainees-without-assignment',
      label: 'Trainees nobody is assigned to',
      detail:
        'Assignments are what RLS reads. A trainee with none is invisible to every supervisor and can never be marked.',
      severity: 'warn',
      count: input.traineesWithoutAssignment,
      href: '/admin/trainees',
    },
    {
      id: 'staff-missing-contact-email',
      label: 'Staff with no reachable e-mail address',
      detail:
        'Their reports still send, without the assessor’s copy. An IPT assessor with no address cannot receive their own report at all.',
      severity: 'warn',
      count: input.staffMissingContactEmail,
      href: '/admin/users',
    },
    {
      id: 'duplicate-trainee-names',
      label: 'Trainees sharing a name within one track',
      detail:
        'Not necessarily wrong — two people can share a name — but a name match cannot tell them apart, so roster imports skip them and they must be checked by hand.',
      severity: 'info',
      count: input.duplicateTraineeNames,
      href: '/admin/trainees',
    },
  ];
}

export function failingChecks(checks: readonly HealthCheck[]): HealthCheck[] {
  return checks.filter((check) => check.count > 0);
}

/** The worst severity present, or null when everything is clear. */
export function worstSeverity(checks: readonly HealthCheck[]): HealthSeverity | null {
  const failing = failingChecks(checks);
  if (failing.some((c) => c.severity === 'urgent')) return 'urgent';
  if (failing.some((c) => c.severity === 'warn')) return 'warn';
  if (failing.length > 0) return 'info';
  return null;
}

export interface SeverityStyle {
  bg: string;
  fg: string;
  label: string;
}

/**
 * Palette note (AGENTS.md: never invent a colour): these are the prototype's
 * own status colours, already used by statusMeta() in lib/trainees.ts — the
 * amber pair is its IPT track chip, the red pair its sign-out/destructive
 * treatment from the account screen.
 */
export function severityStyle(severity: HealthSeverity): SeverityStyle {
  if (severity === 'urgent') return { bg: '#fbe9e4', fg: '#8a3a2a', label: 'Needs attention now' };
  if (severity === 'warn') return { bg: '#fff0d6', fg: '#6b4400', label: 'Worth fixing' };
  return { bg: '#eef1f3', fg: '#4d5f6c', label: 'For information' };
}
