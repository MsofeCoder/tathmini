import { redirect } from 'next/navigation';
import { deriveStatus, type TraineeStatus } from '@/lib/trainees';
import type { CriterionRow } from '@/lib/marking';
import type { OfflineBundleInput } from '@/lib/offline-cache';
import { createClient } from '@/lib/supabase/server';
import { signOut } from './actions';
import { RouteList, type RouteListTrainee } from './route-list';

/**
 * Branches on role: supervisors get their real route list; coordinator and
 * super_admin go to /admin, the administration console, which is now built.
 * (It used to be a placeholder card saying that dashboard did not exist.)
 *
 * The two never bounce: /admin sends a supervisor here, and this sends
 * everyone else there, so no account is redirected by both. A deactivated
 * administrator is sent to /login by the console's own guard rather than
 * back here.
 */
export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('name, role, must_change_password')
    .eq('id', user.id)
    .single();

  if (!profile) redirect('/login');
  if (profile.must_change_password) redirect('/change-password');

  // A coordinator's whole role is oversight, so they land on the read-only
  // dashboard rather than a console whose every control is disabled for them.
  // Carried over from the app shell, which this revert removes — without it the
  // Coordinator dashboard is built and unreachable.
  if (profile.role === 'coordinator') redirect('/coordinator');
  if (profile.role !== 'supervisor') redirect('/admin');

  // RLS scopes every one of these to exactly this signed-in supervisor —
  // see MEMORY.md for the status-derivation design. The assignments and
  // criteria reads exist so this one online visit can arm the whole route
  // for offline marking (see buildOfflineBundle below).
  const [
    traineesRes,
    ownMarksRes,
    resultsRes,
    instrumentsRes,
    routeRes,
    assignmentsRes,
    criteriaRes,
  ] = await Promise.all([
    supabase.from('trainees').select(
      // The register's full particulars, not just the list columns: the
      // offline profile and report preview are built from this snapshot.
      'id, name, occupation, institution, track, route_id, registration_number, course, mode_of_study, region, district, email, phone',
    ),
    supabase
      .from('assessment_marks')
      .select('trainee_id, instrument_id')
      .eq('supervisor_id', user.id)
      .not('submitted_at', 'is', null),
    supabase.from('results').select('trainee_id, locked_at'),
    supabase.from('instruments').select('id, code, label, track'),
    supabase
      .from('routes')
      .select('code, label')
      .or(`supervisor_a1_id.eq.${user.id},supervisor_a2_id.eq.${user.id}`)
      .maybeSingle(),
    supabase.from('assignments').select('trainee_id, slot').eq('supervisor_id', user.id),
    supabase
      .from('criteria')
      .select(
        'id, instrument_id, section_code, section_label, section_max, item_code, item_label, item_max, order_index',
      )
      .order('order_index'),
  ]);

  const trainees = traineesRes.data ?? [];
  // Keyed lookup for the offline snapshot below, which needs the register
  // columns the route list itself does not display.
  const traineeById = new Map(trainees.map((t) => [t.id, t]));

  const ownSubmittedByTrainee = new Map<string, number>();
  for (const row of ownMarksRes.data ?? []) {
    ownSubmittedByTrainee.set(row.trainee_id, (ownSubmittedByTrainee.get(row.trainee_id) ?? 0) + 1);
  }

  const lockedAtByTrainee = new Map<string, string | null>();
  for (const row of resultsRes.data ?? []) {
    lockedAtByTrainee.set(row.trainee_id, row.locked_at);
  }

  const requiredByTrack = new Map<string, number>();
  for (const row of instrumentsRes.data ?? []) {
    requiredByTrack.set(row.track, (requiredByTrack.get(row.track) ?? 0) + 1);
  }

  const routeListTrainees: RouteListTrainee[] = trainees.map((t) => {
    // Carried through alongside the derived status, not just used to
    // derive it: deriveStatus() collapses "some instruments submitted" and
    // "none submitted" both to 'pending', and the route list's in-progress
    // counter has to tell those apart. See routeProgress().
    const ownSubmittedCount = ownSubmittedByTrainee.get(t.id) ?? 0;
    const requiredCount = requiredByTrack.get(t.track) ?? 0;
    const status: TraineeStatus = deriveStatus({
      lockedAt: lockedAtByTrainee.get(t.id),
      ownSubmittedCount,
      requiredCount,
    });
    return {
      id: t.id,
      name: t.name,
      occupation: t.occupation,
      institution: t.institution,
      track: t.track,
      status,
      ownSubmittedCount,
      requiredCount,
    };
  });

  const slotByTrainee = new Map<string, 'a1' | 'a2'>();
  for (const row of assignmentsRes.data ?? []) {
    slotByTrainee.set(row.trainee_id, row.slot as 'a1' | 'a2');
  }

  const submittedInstrumentsByTrainee = new Map<string, string[]>();
  for (const row of ownMarksRes.data ?? []) {
    const existing = submittedInstrumentsByTrainee.get(row.trainee_id) ?? [];
    existing.push(row.instrument_id);
    submittedInstrumentsByTrainee.set(row.trainee_id, existing);
  }

  // Postgres numeric columns arrive from PostgREST as strings.
  const criteriaByInstrument = new Map<string, CriterionRow[]>();
  for (const row of criteriaRes.data ?? []) {
    const list = criteriaByInstrument.get(row.instrument_id) ?? [];
    list.push({
      id: row.id,
      sectionCode: row.section_code,
      sectionLabel: row.section_label,
      sectionMax: Number(row.section_max),
      itemCode: row.item_code,
      itemLabel: row.item_label,
      itemMax: Number(row.item_max),
      orderIndex: row.order_index,
    });
    criteriaByInstrument.set(row.instrument_id, list);
  }

  const offlineBundle: OfflineBundleInput = {
    routeCode: routeRes.data?.code ?? 'MY ROUTE',
    routeLabel: routeRes.data?.label ?? null,
    // Spelled out rather than spread, so what gets written to the device's
    // IndexedDB stays a deliberate shape and does not silently grow every
    // time the route list's own props gain a field.
    supervisorName: profile.name,
    trainees: routeListTrainees.map((t) => {
      const record = traineeById.get(t.id);
      return {
        id: t.id,
        name: t.name,
        occupation: t.occupation,
        institution: t.institution,
        track: t.track,
        status: t.status,
        slot: slotByTrainee.get(t.id) ?? null,
        submittedInstrumentIds: submittedInstrumentsByTrainee.get(t.id) ?? [],
        registrationNumber: record?.registration_number ?? null,
        course: record?.course ?? '',
        modeOfStudy: record?.mode_of_study ?? null,
        region: record?.region ?? null,
        district: record?.district ?? null,
        email: record?.email ?? null,
        phone: record?.phone ?? null,
        ownSubmittedCount: t.ownSubmittedCount,
        requiredCount: t.requiredCount,
      };
    }),
    instruments: (instrumentsRes.data ?? []).map((i) => ({
      id: i.id,
      code: i.code,
      label: i.label,
      track: i.track as 'TP' | 'IPT',
      criteria: criteriaByInstrument.get(i.id) ?? [],
    })),
  };

  return (
    <div>
      <RouteList
        routeCode={routeRes.data?.code ?? 'MY ROUTE'}
        routeLabel={routeRes.data?.label ?? null}
        trainees={routeListTrainees}
        offlineBundle={offlineBundle}
      />
      <div className="p-4">
        <form action={signOut}>
          <button
            type="submit"
            className="focus:outline-accent min-h-[48px] w-full rounded-xl border border-[#e0b6ab] bg-white text-[15px] font-semibold text-[#8a3a2a] focus:outline focus:outline-[3px] focus:outline-offset-2"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
