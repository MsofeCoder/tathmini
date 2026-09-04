import { redirect } from 'next/navigation';
import { deriveStatus, type TraineeStatus } from '@/lib/trainees';
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
  // see MEMORY.md for the four-query status-derivation design.
  const [traineesRes, ownMarksRes, resultsRes, instrumentsRes, routeRes] = await Promise.all([
    supabase.from('trainees').select('id, name, occupation, institution, track, route_id'),
    supabase
      .from('assessment_marks')
      .select('trainee_id')
      .eq('supervisor_id', user.id)
      .not('submitted_at', 'is', null),
    supabase.from('results').select('trainee_id, locked_at'),
    supabase.from('instruments').select('track'),
    supabase
      .from('routes')
      .select('code, label')
      .or(`supervisor_a1_id.eq.${user.id},supervisor_a2_id.eq.${user.id}`)
      .maybeSingle(),
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

  return (
    <div>
      <RouteList
        routeCode={routeRes.data?.code ?? 'MY ROUTE'}
        routeLabel={routeRes.data?.label ?? null}
        trainees={routeListTrainees}
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
