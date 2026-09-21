/**
 * The rows behind a supervisor's results workbook.
 *
 * Everything is read through the caller's own authenticated client — the
 * service-role key is not here and must never be (AGENTS.md). RLS is what
 * decides which rows land in the file, which is also what makes this correct
 * without a line of filtering: `assessment_marks_select` withholds the other
 * assessor's marks until both slots are submitted, so a supervisor
 * downloading mid-route gets their own marks and blanks beside them. The
 * sheet says so in its header note rather than pretending the gap is data.
 *
 * The pivot itself is pure and exported, so the shape of a workbook row can
 * be tested without a database.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { NO_MARKS, type AssessorMarks, type RouteResultRow, type Track } from './layout';

/** PostgREST caps a response; a route is far below it, but never assume. */
const PAGE_SIZE = 1000;

export interface RouteSheetData {
  routeCode: string;
  routeLabel: string | null;
  track: Track;
  rows: RouteResultRow[];
  /** The assessors the route assigns — see loadAssessorNames(). */
  a1Name: string | null;
  a2Name: string | null;
}

interface TraineeRow {
  id: string;
  name: string;
  registration_number: string | null;
  occupation: string;
  institution: string;
  district: string | null;
  region: string | null;
  track: Track;
  route_id: string;
}

interface MarkRow {
  trainee_id: string;
  slot: 'a1' | 'a2';
  instrument_code: string;
  total: string | number | null;
  assessed_on: string | null;
  /**
   * The day the mark reached the College. Printed when `assessed_on` is null,
   * which is 326 of 1 539 marks: 165 were submitted before migration 0034
   * added the column and can never have one, and 161 were submitted after it
   * with the field left blank. The submission date is what the report printed
   * before 0034 existed, so this is the same fallback, not a new invention —
   * and unlike a fixed date it is true of each row individually.
   */
  submitted_on: string | null;
  supervisor_name: string | null;
}

interface ResultRow {
  trainee_id: string;
  theory_total: string | number | null;
  practical_total: string | number | null;
  total: string | number | null;
  pct: string | number | null;
  grade: string | null;
  competent: boolean | null;
}

function num(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Marks, results and trainees into one row per trainee.
 *
 * Marks arrive from `route_results_marks()` already carrying their instrument
 * code and their assessor's name, so there is nothing to resolve here.
 */
export function pivotRows(
  trainees: TraineeRow[],
  marks: MarkRow[],
  results: ResultRow[],
): RouteResultRow[] {
  const resultByTrainee = new Map(results.map((r) => [r.trainee_id, r]));

  const marksByTrainee = new Map<string, MarkRow[]>();
  for (const mark of marks) {
    const list = marksByTrainee.get(mark.trainee_id) ?? [];
    list.push(mark);
    marksByTrainee.set(mark.trainee_id, list);
  }

  return trainees.map((trainee) => {
    const own = marksByTrainee.get(trainee.id) ?? [];

    const slotMarks = (slot: 'a1' | 'a2'): AssessorMarks => {
      const rows = own.filter((m) => m.slot === slot);
      const first = rows[0];
      if (!first) return NO_MARKS;

      const byCode = (code: string) => num(rows.find((m) => m.instrument_code === code)?.total);

      return {
        theory: trainee.track === 'TP' ? byCode('tp_theory') : null,
        practical: trainee.track === 'TP' ? byCode('tp_practical') : null,
        single: trainee.track === 'IPT' ? num(first.total) : null,
        // One assessor, one visit: any of their rows carries the date, and
        // the earliest is the one the form means when the two differ.
        assessedOn:
          rows
            .map((m) => m.assessed_on ?? m.submitted_on)
            .filter((d): d is string => Boolean(d))
            .sort()[0] ?? null,
        name: rows.map((m) => m.supervisor_name).find(Boolean) ?? null,
      };
    };

    const result = resultByTrainee.get(trainee.id);

    return {
      name: trainee.name,
      registrationNumber: trainee.registration_number,
      occupation: trainee.occupation,
      institution: trainee.institution,
      district: trainee.district,
      region: trainee.region,
      a1: slotMarks('a1'),
      a2: slotMarks('a2'),
      theoryTotal: num(result?.theory_total),
      practicalTotal: num(result?.practical_total),
      total: num(result?.total),
      pct: num(result?.pct),
      grade: result?.grade ?? null,
      competent: result?.competent ?? null,
    };
  });
}

async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; ; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error || !data) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

/**
 * Every route this supervisor holds a slot on, with its trainees' results.
 *
 * Usually one route. Not always — one supervisor in the live register covers
 * a TP route and an IPT route at once, which is why this returns a list and
 * the workbook takes a sheet per route. A supervisor with no assignments
 * returns an empty list and the caller declines to build a file.
 *
 * Sorted by route code so two downloads of unchanged data are identical.
 */
export async function loadSupervisorRouteSheets(
  supabase: SupabaseClient,
  supervisorId: string,
): Promise<RouteSheetData[]> {
  const assignments = await fetchAll<{ trainee_id: string }>((from, to) =>
    supabase
      .from('assignments')
      .select('trainee_id')
      .eq('supervisor_id', supervisorId)
      .range(from, to),
  );

  const traineeIds = [...new Set(assignments.map((a) => a.trainee_id))];
  if (traineeIds.length === 0) return [];

  const [trainees, marks, results, assessorNames] = await Promise.all([
    fetchAll<TraineeRow>((from, to) =>
      supabase
        .from('trainees')
        .select(
          'id, name, registration_number, occupation, institution, district, region, track, route_id',
        )
        .in('id', traineeIds)
        .order('name')
        .range(from, to),
    ),
    loadMarks(supabase),
    fetchAll<ResultRow>((from, to) =>
      supabase
        .from('results')
        .select('trainee_id, theory_total, practical_total, total, pct, grade, competent')
        .in('trainee_id', traineeIds)
        .range(from, to),
    ),
    loadAssessorNames(supabase),
  ]);

  const routeIds = [...new Set(trainees.map((t) => t.route_id))];
  const routes = await fetchAll<{ id: string; code: string; label: string | null }>((from, to) =>
    supabase.from('routes').select('id, code, label').in('id', routeIds).range(from, to),
  );

  const routeById = new Map(routes.map((r) => [r.id, r]));

  const sheets: RouteSheetData[] = [];
  for (const routeId of routeIds) {
    const route = routeById.get(routeId);
    const ofRoute = trainees.filter((t) => t.route_id === routeId);
    const firstOfRoute = ofRoute[0];
    if (!route || !firstOfRoute) continue;

    const traineeIdSet = new Set(ofRoute.map((t) => t.id));
    const assessors = assessorNames.get(routeId);
    sheets.push({
      routeCode: route.code,
      routeLabel: route.label,
      track: firstOfRoute.track,
      a1Name: assessors?.a1_name ?? null,
      a2Name: assessors?.a2_name ?? null,
      rows: pivotRows(
        ofRoute,
        marks.filter((m) => traineeIdSet.has(m.trainee_id)),
        results.filter((r) => traineeIdSet.has(r.trainee_id)),
      ),
    });
  }

  return sheets.sort((a, b) => a.routeCode.localeCompare(b.routeCode));
}

/**
 * Submitted marks for the caller's own routes, through migration 0035's
 * `route_results_marks()`.
 *
 * Not a table read. `assessment_marks_select` withholds the other assessor's
 * marks until both slots are submitted, and `users_select` gives a supervisor
 * only their own row — so read directly, this export prints blank columns and
 * an unnamed ASSESSOR 2. The College decided on 21 September that the summary
 * shows both assessors, and 0035 is that decision: one SECURITY DEFINER
 * function, scoped to routes the caller is on, returning marks and names and
 * nothing else. The table policies are untouched, so the marking screen still
 * cannot see the other slot.
 *
 * The function scopes itself by `assignments`, so no trainee filter is needed
 * or wanted here — passing one would only narrow what it already narrowed.
 */
/**
 * The two assessors each of the caller's routes assigns, through 0035's
 * `route_assessor_names()`.
 *
 * `routes` is readable by its own two supervisors, but it carries uuids, and
 * resolving those to names needs `users`, which a supervisor may read only
 * for themselves. This is the whole reason the banner could not name a
 * colleague. Only needed when an assessor has marked nobody yet — otherwise
 * their own marks carry the name — so an empty answer is not a failure.
 */
async function loadAssessorNames(
  supabase: SupabaseClient,
): Promise<Map<string, { a1_name: string | null; a2_name: string | null }>> {
  const { data, error } = await supabase.rpc('route_assessor_names');
  if (error || !data) return new Map();
  return new Map(
    (data as { route_id: string; a1_name: string | null; a2_name: string | null }[]).map((row) => [
      row.route_id,
      { a1_name: row.a1_name, a2_name: row.a2_name },
    ]),
  );
}

async function loadMarks(supabase: SupabaseClient): Promise<MarkRow[]> {
  const { data, error } = await supabase.rpc('route_results_marks');
  if (error || !data) return [];
  return data as MarkRow[];
}
