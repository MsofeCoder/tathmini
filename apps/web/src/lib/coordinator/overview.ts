/**
 * The numbers behind the Coordinator's dashboard.
 *
 * Pure, and tested, because they are the figures the College will quote in a
 * meeting: how far marking has got, which routes are behind, which assessor
 * has not started. Getting "62% complete" wrong is worse than showing nothing.
 *
 * Nothing here computes a grade, a total or a verdict — those come from
 * Postgres (AGENTS.md rule 3) and are only ever counted here, never derived.
 */

export interface TraineeLike {
  id: string;
  name: string;
  track: 'TP' | 'IPT';
  routeId: string;
}

export interface MarkLike {
  traineeId: string;
  supervisorId: string;
  slot: 'a1' | 'a2';
  instrumentId: string;
}

export type CompletionState = 'locked' | 'partial' | 'not-started';

/**
 * Where one trainee stands, from the College's point of view rather than a
 * single assessor's.
 *
 * `expected` is both assessors × every instrument the track requires: 4 for a
 * TP trainee (theory and practical, twice) and 2 for IPT. A supervisor's own
 * screen counts only their own half — this deliberately does not.
 */
export function traineeCompletion(input: {
  submitted: number;
  expected: number;
  lockedAt: string | null | undefined;
}): CompletionState {
  if (input.lockedAt) return 'locked';
  return input.submitted > 0 ? 'partial' : 'not-started';
}

export interface RouteProgress {
  routeId: string;
  code: string;
  a1Name: string | null;
  a2Name: string | null;
  trainees: number;
  locked: number;
  partial: number;
  notStarted: number;
  /** Marks submitted out of every mark this route eventually needs. */
  marksSubmitted: number;
  marksExpected: number;
  percentComplete: number;
}

export interface RouteProgressInput {
  routes: { id: string; code: string; a1Name: string | null; a2Name: string | null }[];
  trainees: TraineeLike[];
  marks: MarkLike[];
  lockedTraineeIds: ReadonlySet<string>;
  /** How many instruments each track requires: TP 2, IPT 1. */
  instrumentsPerTrack: ReadonlyMap<string, number>;
}

export function routeProgress(input: RouteProgressInput): RouteProgress[] {
  const marksByTrainee = new Map<string, number>();
  for (const mark of input.marks) {
    marksByTrainee.set(mark.traineeId, (marksByTrainee.get(mark.traineeId) ?? 0) + 1);
  }

  return input.routes
    .map((route) => {
      const onRoute = input.trainees.filter((t) => t.routeId === route.id);

      let locked = 0;
      let partial = 0;
      let notStarted = 0;
      let marksSubmitted = 0;
      let marksExpected = 0;

      for (const trainee of onRoute) {
        const submitted = marksByTrainee.get(trainee.id) ?? 0;
        // Both assessors, every instrument the track requires.
        const expected = (input.instrumentsPerTrack.get(trainee.track) ?? 0) * 2;
        marksSubmitted += submitted;
        marksExpected += expected;

        const state = traineeCompletion({
          submitted,
          expected,
          lockedAt: input.lockedTraineeIds.has(trainee.id) ? 'locked' : null,
        });
        if (state === 'locked') locked += 1;
        else if (state === 'partial') partial += 1;
        else notStarted += 1;
      }

      return {
        routeId: route.id,
        code: route.code,
        a1Name: route.a1Name,
        a2Name: route.a2Name,
        trainees: onRoute.length,
        locked,
        partial,
        notStarted,
        marksSubmitted,
        marksExpected,
        percentComplete: percent(marksSubmitted, marksExpected),
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));
}

export interface AssessorActivity {
  supervisorId: string;
  name: string;
  routeCodes: string[];
  /** Marks this assessor owes: their assigned trainees × the track's instruments. */
  expected: number;
  submitted: number;
  percentComplete: number;
}

export interface AssessorActivityInput {
  supervisors: { id: string; name: string }[];
  assignments: { traineeId: string; supervisorId: string }[];
  trainees: TraineeLike[];
  marks: MarkLike[];
  routeCodeById: ReadonlyMap<string, string>;
  instrumentsPerTrack: ReadonlyMap<string, number>;
}

/**
 * Per assessor, how much of their OWN half is done.
 *
 * Counted from `assignments` rather than from the route table: a single
 * trainee can be handed to a different assessor without moving route, so the
 * route's standing pair is not always who owes the marks.
 */
export function assessorActivity(input: AssessorActivityInput): AssessorActivity[] {
  const traineeById = new Map(input.trainees.map((t) => [t.id, t]));

  const submittedBy = new Map<string, number>();
  for (const mark of input.marks) {
    submittedBy.set(mark.supervisorId, (submittedBy.get(mark.supervisorId) ?? 0) + 1);
  }

  const expectedBy = new Map<string, number>();
  const routesBy = new Map<string, Set<string>>();
  for (const assignment of input.assignments) {
    const trainee = traineeById.get(assignment.traineeId);
    if (!trainee) continue;
    const instruments = input.instrumentsPerTrack.get(trainee.track) ?? 0;
    expectedBy.set(
      assignment.supervisorId,
      (expectedBy.get(assignment.supervisorId) ?? 0) + instruments,
    );

    const code = input.routeCodeById.get(trainee.routeId);
    if (code) {
      const set = routesBy.get(assignment.supervisorId) ?? new Set<string>();
      set.add(code);
      routesBy.set(assignment.supervisorId, set);
    }
  }

  return input.supervisors
    .map((supervisor) => {
      const expected = expectedBy.get(supervisor.id) ?? 0;
      const submitted = submittedBy.get(supervisor.id) ?? 0;
      return {
        supervisorId: supervisor.id,
        name: supervisor.name,
        routeCodes: [...(routesBy.get(supervisor.id) ?? [])].sort((a, b) =>
          a.localeCompare(b, 'en', { numeric: true }),
        ),
        expected,
        submitted,
        percentComplete: percent(submitted, expected),
      };
    })
    .filter((row) => row.expected > 0)
    .sort((a, b) => a.percentComplete - b.percentComplete || a.name.localeCompare(b.name));
}

/**
 * Grades, in the VETA order the form itself uses — never sorted by size.
 *
 * A grade is an ordered scale, so the bars stay in scale order even when that
 * means the tallest sits in the middle; re-ranking them would make the shape
 * of the cohort unreadable at a glance.
 */
export const GRADE_ORDER = ['A', 'B', 'C', 'D', 'F'] as const;

export interface GradeCount {
  grade: string;
  count: number;
}

export function gradeDistribution(results: { grade: string | null }[]): GradeCount[] {
  const counts = new Map<string, number>();
  for (const result of results) {
    if (!result.grade) continue;
    counts.set(result.grade, (counts.get(result.grade) ?? 0) + 1);
  }

  const known = GRADE_ORDER.map((grade) => ({ grade, count: counts.get(grade) ?? 0 }));
  // Anything the database produced that is not in the printed scale still gets
  // shown, after the scale, rather than silently dropped.
  const extra = [...counts.keys()]
    .filter((grade) => !GRADE_ORDER.includes(grade as (typeof GRADE_ORDER)[number]))
    .sort()
    .map((grade) => ({ grade, count: counts.get(grade) ?? 0 }));

  return [...known, ...extra];
}

export interface VerdictSplit {
  competent: number;
  notCompetent: number;
  undecided: number;
}

export function verdictSplit(results: { competent: boolean | null }[]): VerdictSplit {
  let competent = 0;
  let notCompetent = 0;
  let undecided = 0;
  for (const result of results) {
    if (result.competent === true) competent += 1;
    else if (result.competent === false) notCompetent += 1;
    else undecided += 1;
  }
  return { competent, notCompetent, undecided };
}

/** Whole-number percentage; 0 when there is nothing to divide by. */
export function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}
