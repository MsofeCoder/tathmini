import type { SupabaseClient } from '@supabase/supabase-js';
import {
  toLocalAssignment,
  toLocalCriterion,
  toLocalInstrument,
  toLocalMark,
  toLocalReport,
  toLocalResult,
  toLocalTrainee,
  type Row,
} from './rows';
import type { SyncPayload } from './types';

/**
 * Reads everything the signed-in user may see, server-side, and returns it in
 * the shape the device stores.
 *
 * SERVER ONLY. It runs with the caller's own session, so every query here is
 * scoped by RLS exactly as it was when these same reads lived inside `/home`'s
 * server component — this moved the queries, it did not widen them. A
 * supervisor gets their own route; the policies decide that, not this file
 * (AGENTS.md rule 1).
 *
 * The queries are unfiltered by route on purpose, mirroring what `/home` did
 * before: `trainees_select` already limits the rows to the ones the caller is
 * assigned to. Adding a route filter here would duplicate the policy in
 * TypeScript and quietly disagree with it the first time a supervisor covers
 * two routes.
 *
 * The row mapping is `rows.ts`, shared with the Realtime handler — the same
 * column arriving by either transport becomes the same local record.
 */
export async function collectSyncPayload(
  supabase: SupabaseClient,
  userId: string,
): Promise<SyncPayload | null> {
  const { data: profile } = await supabase
    .from('users')
    .select('name, role, must_change_password')
    .eq('id', userId)
    .maybeSingle();

  if (!profile) return null;

  const [
    traineesRes,
    assignmentsRes,
    instrumentsRes,
    criteriaRes,
    marksRes,
    resultsRes,
    reportsRes,
    routeRes,
  ] = await Promise.all([
    supabase
      .from('trainees')
      .select(
        'id, name, occupation, institution, track, route_id, registration_number, course, mode_of_study, region, district, email, phone',
      ),
    supabase.from('assignments').select('trainee_id, slot').eq('supervisor_id', userId),
    supabase.from('instruments').select('id, code, label, track, max_total'),
    supabase
      .from('criteria')
      .select(
        'id, instrument_id, section_code, section_label, section_max, item_code, item_label, item_max, order_index',
      )
      .order('order_index'),
    supabase
      .from('assessment_marks')
      .select('trainee_id, instrument_id, submitted_at')
      .eq('supervisor_id', userId),
    supabase.from('results').select('trainee_id, locked_at'),
    supabase.from('reports').select('trainee_id, generated_at').eq('generated_by_id', userId),
    supabase
      .from('routes')
      .select('code, label')
      .or(`supervisor_a1_id.eq.${userId},supervisor_a2_id.eq.${userId}`)
      .maybeSingle(),
  ]);

  const rows = (res: { data: unknown }): Row[] => (res.data as Row[] | null) ?? [];

  return {
    session: {
      userId,
      name: String(profile.name ?? ''),
      role: String(profile.role ?? ''),
      mustChangePassword: !!profile.must_change_password,
      routeCode: routeRes.data?.code ?? 'MY ROUTE',
      routeLabel: routeRes.data?.label ?? null,
    },
    trainees: rows(traineesRes).map(toLocalTrainee),
    assignments: rows(assignmentsRes).map(toLocalAssignment),
    instruments: rows(instrumentsRes).map(toLocalInstrument),
    criteria: rows(criteriaRes).map(toLocalCriterion),
    marks: rows(marksRes).map(toLocalMark),
    results: rows(resultsRes).map(toLocalResult),
    reports: rows(reportsRes).map(toLocalReport),
  };
}
