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
  instrument_id: string;
  total: string | number | null;
  assessed_on: string | null;
  supervisor: { name: string } | { name: string }[] | null;
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

interface InstrumentRow {
  id: string;
  code: string;
}

function num(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The embedded `users(name)` comes back as an object or a one-element array
 * depending on how PostgREST reads the relationship, and as null whenever
 * `users_select` refuses the row — which is every colleague, for a
 * supervisor. All three are the same answer here: a name, or nothing.
 */
function supervisorName(supervisor: MarkRow['supervisor']): string | null {
  if (!supervisor) return null;
  const one = Array.isArray(supervisor) ? supervisor[0] : supervisor;
  return one?.name ?? null;
}

/**
 * Marks, results and trainees into one row per trainee.
 *
 * `instrumentCodes` maps an instrument id to its code so a TP mark can be
 * put in the right column; IPT has one instrument and needs no such care.
 */
export function pivotRows(
  trainees: TraineeRow[],
  marks: MarkRow[],
  results: ResultRow[],
  instrumentCodes: Map<string, string>,
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

      const byCode = (code: string) =>
        num(rows.find((m) => instrumentCodes.get(m.instrument_id) === code)?.total);

      return {
        theory: trainee.track === 'TP' ? byCode('tp_theory') : null,
        practical: trainee.track === 'TP' ? byCode('tp_practical') : null,
        single: trainee.track === 'IPT' ? num(first.total) : null,
        // One assessor, one visit: any of their rows carries the date, and
        // the earliest is the one the form means when the two differ.
        assessedOn:
          rows
            .map((m) => m.assessed_on)
            .filter((d): d is string => Boolean(d))
            .sort()[0] ?? null,
        name: rows.map((m) => supervisorName(m.supervisor)).find(Boolean) ?? null,
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

  const [trainees, marks, results, instruments] = await Promise.all([
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
    loadMarks(supabase, traineeIds),
    fetchAll<ResultRow>((from, to) =>
      supabase
        .from('results')
        .select('trainee_id, theory_total, practical_total, total, pct, grade, competent')
        .in('trainee_id', traineeIds)
        .range(from, to),
    ),
    fetchAll<InstrumentRow>((from, to) =>
      supabase.from('instruments').select('id, code').range(from, to),
    ),
  ]);

  const routeIds = [...new Set(trainees.map((t) => t.route_id))];
  const routes = await fetchAll<{ id: string; code: string; label: string | null }>((from, to) =>
    supabase.from('routes').select('id, code, label').in('id', routeIds).range(from, to),
  );

  const instrumentCodes = new Map(instruments.map((i) => [i.id, i.code]));
  const routeById = new Map(routes.map((r) => [r.id, r]));

  const sheets: RouteSheetData[] = [];
  for (const routeId of routeIds) {
    const route = routeById.get(routeId);
    const ofRoute = trainees.filter((t) => t.route_id === routeId);
    const firstOfRoute = ofRoute[0];
    if (!route || !firstOfRoute) continue;

    const traineeIdSet = new Set(ofRoute.map((t) => t.id));
    sheets.push({
      routeCode: route.code,
      routeLabel: route.label,
      track: firstOfRoute.track,
      rows: pivotRows(
        ofRoute,
        marks.filter((m) => traineeIdSet.has(m.trainee_id)),
        results.filter((r) => traineeIdSet.has(r.trainee_id)),
        instrumentCodes,
      ),
    });
  }

  return sheets.sort((a, b) => a.routeCode.localeCompare(b.routeCode));
}

/**
 * Submitted marks only — a draft is not a result and must never reach a
 * College spreadsheet.
 *
 * `assessed_on` arrived with migration 0034; the fallback repeats the read
 * without it so this keeps working against a database where that migration
 * has not been applied, exactly as lib/reports/data.ts does.
 */
async function loadMarks(supabase: SupabaseClient, traineeIds: string[]): Promise<MarkRow[]> {
  const columns = 'trainee_id, slot, instrument_id, total, supervisor:users(name)';

  const withDate = await fetchAll<MarkRow>((from, to) =>
    supabase
      .from('assessment_marks')
      .select(`${columns}, assessed_on`)
      .in('trainee_id', traineeIds)
      .not('submitted_at', 'is', null)
      .range(from, to),
  );
  if (withDate.length > 0) return withDate;

  const withoutDate = await fetchAll<Omit<MarkRow, 'assessed_on'>>((from, to) =>
    supabase
      .from('assessment_marks')
      .select(columns)
      .in('trainee_id', traineeIds)
      .not('submitted_at', 'is', null)
      .range(from, to),
  );
  return withoutDate.map((row) => ({ ...row, assessed_on: null }));
}
