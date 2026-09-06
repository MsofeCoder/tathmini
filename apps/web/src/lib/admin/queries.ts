import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Reads shared by the console's screens. Every one of them runs on the
 * signed-in administrator's session — RLS decides what comes back, and the
 * service-role key never enters this process (AGENTS.md).
 */

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  contact_email: string | null;
  must_change_password: boolean;
  created_at: string;
}

export interface AdminRouteRow {
  id: string;
  code: string;
  label: string | null;
  supervisor_a1_id: string | null;
  supervisor_a2_id: string | null;
}

export interface AdminTraineeRow {
  id: string;
  name: string;
  registration_number: string | null;
  course: string;
  occupation: string;
  institution: string;
  mode_of_study: string | null;
  district: string | null;
  region: string | null;
  email: string | null;
  phone: string | null;
  track: 'TP' | 'IPT';
  route_id: string;
}

export interface AdminAssignmentRow {
  trainee_id: string;
  supervisor_id: string;
  slot: 'a1' | 'a2';
}

export interface AdminMarkRow {
  trainee_id: string;
  supervisor_id: string;
  slot: 'a1' | 'a2';
  instrument_id: string;
  submitted_at: string | null;
}

const TRAINEE_COLUMNS =
  'id, name, registration_number, course, occupation, institution, mode_of_study, district, region, email, phone, track, route_id';

/**
 * PostgREST caps a single response (Supabase ships a 1000-row default), and
 * two of these tables are already past it — `assignments` holds 1 088 rows
 * for 546 trainees. A truncated read here would not error; it would quietly
 * under-count, which on the "trainees nobody is assigned to" check would
 * invent hundreds of defects that do not exist. So every list read pages.
 */
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; ; page += 1) {
    const from = page * pageSize;
    const { data, error } = await build(from, from + pageSize - 1);
    if (error || !data) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}

export function loadUsers(supabase: SupabaseClient): Promise<AdminUserRow[]> {
  return fetchAll<AdminUserRow>((from, to) =>
    supabase
      .from('users')
      .select('id, name, email, role, active, contact_email, must_change_password, created_at')
      .order('name')
      .range(from, to),
  );
}

export function loadRoutes(supabase: SupabaseClient): Promise<AdminRouteRow[]> {
  return fetchAll<AdminRouteRow>((from, to) =>
    supabase
      .from('routes')
      .select('id, code, label, supervisor_a1_id, supervisor_a2_id')
      .order('code')
      .range(from, to),
  );
}

export function loadTrainees(supabase: SupabaseClient): Promise<AdminTraineeRow[]> {
  return fetchAll<AdminTraineeRow>((from, to) =>
    supabase.from('trainees').select(TRAINEE_COLUMNS).order('name').range(from, to),
  );
}

export function loadAssignments(supabase: SupabaseClient): Promise<AdminAssignmentRow[]> {
  return fetchAll<AdminAssignmentRow>((from, to) =>
    supabase.from('assignments').select('trainee_id, supervisor_id, slot').range(from, to),
  );
}

/** Submitted marks only — a draft row that was never submitted blocks nothing. */
export function loadSubmittedMarks(supabase: SupabaseClient): Promise<AdminMarkRow[]> {
  return fetchAll<AdminMarkRow>((from, to) =>
    supabase
      .from('assessment_marks')
      .select('trainee_id, supervisor_id, slot, instrument_id, submitted_at')
      .not('submitted_at', 'is', null)
      .range(from, to),
  );
}

/**
 * Rows sharing a value, ignoring case and surrounding space but never
 * rewriting the value itself. Used for the two register defects that keep
 * recurring: two trainees on one e-mail address (each would receive the
 * other's marks now that result e-mail is live) and two trainees with one
 * name in the same track (which a name-matched roster import cannot tell
 * apart, so migration 0028 excludes five of them by hand).
 */
export function groupDuplicates<T>(rows: readonly T[], key: (row: T) => string | null): T[][] {
  const buckets = new Map<string, T[]>();
  for (const row of rows) {
    const raw = key(row);
    if (!raw) continue;
    const normalised = raw.trim().toLowerCase().replace(/\s+/g, ' ');
    if (normalised === '') continue;
    const bucket = buckets.get(normalised);
    if (bucket) bucket.push(row);
    else buckets.set(normalised, [row]);
  }
  return [...buckets.values()].filter((bucket) => bucket.length > 1);
}
