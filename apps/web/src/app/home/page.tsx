import { redirect } from 'next/navigation';
import { deriveStatus, type TraineeStatus } from '@/lib/trainees';
import type { CriterionRow } from '@/lib/marking';
import type { OfflineBundleInput } from '@/lib/offline-cache';
import { createClient } from '@/lib/supabase/server';
import { signOut } from './actions';
import { RouteList, type RouteListTrainee } from './route-list';

/**
 * Branches on role: supervisors get their real route list; coordinator/
 * super_admin keep the generic placeholder — their real dashboard is
 * separate, unbuilt Phase 3 work (ROADMAP.md).
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

  if (profile.role !== 'supervisor') {
    return <Placeholder name={profile.name} role={profile.role} />;
  }

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
    supabase.from('trainees').select('id, name, occupation, institution, track, route_id'),
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
    const status: TraineeStatus = deriveStatus({
      lockedAt: lockedAtByTrainee.get(t.id),
      ownSubmittedCount: ownSubmittedByTrainee.get(t.id) ?? 0,
      requiredCount: requiredByTrack.get(t.track) ?? 0,
    });
    return {
      id: t.id,
      name: t.name,
      occupation: t.occupation,
      institution: t.institution,
      track: t.track,
      status,
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
    trainees: routeListTrainees.map((t) => ({
      ...t,
      slot: slotByTrainee.get(t.id) ?? null,
      submittedInstrumentIds: submittedInstrumentsByTrainee.get(t.id) ?? [],
    })),
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

function Placeholder({ name, role }: { name: string; role: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#eceff0] p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm">
        <p className="text-teal-mid text-[12px] font-extrabold tracking-[0.7px]">SIGNED IN</p>
        <h1 className="mt-2 text-[22px] font-bold text-neutral-900">{name}</h1>
        <p className="mt-1 text-sm capitalize text-[#5b6b78]">{role.replace('_', ' ')}</p>
        <p className="mt-4 text-[13px] leading-relaxed text-[#5b6b78]">
          The coordinator/admin dashboard isn&apos;t built yet — see ROADMAP.md Phase 3.
        </p>

        <form action={signOut} className="mt-6">
          <button
            type="submit"
            className="focus:outline-accent min-h-[48px] w-full rounded-xl border border-[#e0b6ab] bg-white text-[15px] font-semibold text-[#8a3a2a] focus:outline focus:outline-[3px] focus:outline-offset-2"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
