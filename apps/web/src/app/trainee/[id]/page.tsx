import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { traineeParticulars, trackChipStyle, trackPointsLabel } from '@/lib/trainees';

const ASSESSOR_SLOT_LABELS: Record<string, string> = {
  a1: 'Assessor 1',
  a2: 'Assessor 2',
};

/**
 * "Pre-loaded particulars" screen — a read-only port of the prototype's
 * showProfile (reference/Tathmini.dc.html lines 323-398). Deliberately
 * excludes showProfile's notify-the-trainee panel (Phase 2, needs a real
 * SMS/e-mail send path), draft-in-progress banner (needs Dexie, unbuilt),
 * "Start assessment" button (the marking-flow UI is the next unchecked
 * ROADMAP.md Phase 1 line, not this one), and reassignment request
 * (Phase 3 Super Admin work) — see MEMORY.md for the full reasoning.
 */
export default async function TraineeProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('name, must_change_password')
    .eq('id', user.id)
    .single();

  if (!profile) redirect('/login');
  if (profile.must_change_password) redirect('/change-password');

  // RLS scopes this to a trainee the signed-in user is actually assigned
  // to (or a coordinator/super_admin) — a stray id just renders "not found".
  const { data: trainee } = await supabase
    .from('trainees')
    .select(
      'name, track, registration_number, occupation, course, mode_of_study, institution, region, district, email, phone',
    )
    .eq('id', id)
    .maybeSingle();

  if (!trainee) {
    return <NotFound />;
  }

  const [assignmentRes, resultRes, instrumentsRes, ownMarksRes] = await Promise.all([
    supabase
      .from('assignments')
      .select('slot')
      .eq('trainee_id', id)
      .eq('supervisor_id', user.id)
      .maybeSingle(),
    supabase.from('results').select('locked_at').eq('trainee_id', id).maybeSingle(),
    supabase.from('instruments').select('id, code, label, track, max_total'),
    supabase
      .from('assessment_marks')
      .select('instrument_id, submitted_at')
      .eq('trainee_id', id)
      .eq('supervisor_id', user.id),
  ]);

  const slotLabel = assignmentRes.data ? ASSESSOR_SLOT_LABELS[assignmentRes.data.slot] : null;
  const assessedByLabel = slotLabel ? `${profile.name} (${slotLabel} of 2)` : profile.name;

  // Postgres numeric columns come back from PostgREST as strings.
  const maxTotalByCode = new Map<string, number>();
  for (const row of instrumentsRes.data ?? []) {
    maxTotalByCode.set(row.code, Number(row.max_total));
  }

  const track = trainee.track as 'TP' | 'IPT';
  const chip = trackChipStyle(track);
  const rows = traineeParticulars({
    track,
    registrationNumber: trainee.registration_number,
    occupation: trainee.occupation,
    course: trainee.course,
    modeOfStudy: trainee.mode_of_study,
    institution: trainee.institution,
    region: trainee.region,
    district: trainee.district,
    email: trainee.email,
    phone: trainee.phone,
    assessedByLabel,
  });

  const locked = !!resultRes.data?.locked_at;

  const submittedByInstrument = new Set(
    (ownMarksRes.data ?? []).filter((m) => m.submitted_at).map((m) => m.instrument_id),
  );
  const trackInstruments = (instrumentsRes.data ?? [])
    .filter((i) => i.track === track)
    .map((i) => ({
      code: i.code,
      label: i.label,
      submitted: submittedByInstrument.has(i.id),
    }));
  const canAssess = !!assignmentRes.data && !locked;

  return (
    <main className="min-h-dvh bg-[#eceff0]">
      <div className="border-b border-[#e1e9e6] bg-white p-4">
        <a href="/home" className="text-teal-mid text-[14px] font-semibold">
          ‹ My route
        </a>
      </div>
      <div className="p-5">
        <p className="text-[13px] font-semibold text-[#5b6b78]">You are about to assess</p>
        <h1 className="mt-1.5 text-[27px] font-bold tracking-[-0.4px] text-neutral-900">
          {trainee.name}
        </h1>

        <div className="mt-4.5 overflow-hidden rounded-2xl border border-[#e1e9e6] bg-white">
          <div className="flex items-center justify-between gap-4 border-b border-[#f1f5f4] px-4 py-3.5">
            <span className="text-[13px] font-semibold text-[#5b6b78]">Track</span>
            <span
              className="rounded-full px-2.5 py-1 text-[12px] font-bold"
              style={{ background: chip.bg, color: chip.fg }}
            >
              {trackPointsLabel(track, maxTotalByCode)}
            </span>
          </div>
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex justify-between gap-4 border-b border-[#f1f5f4] px-4 py-3.5 last:border-b-0"
            >
              <span className="shrink-0 text-[13px] font-semibold text-[#5b6b78]">{row.label}</span>
              <span className="text-right text-[14px] font-semibold text-[#14232e]">
                {row.value}
              </span>
            </div>
          ))}
        </div>

        <p className="mt-3 text-[12.5px] leading-relaxed text-[#5f6f7c]">
          Every particular above is pre-loaded from the College register and read-only, so the
          printed report carries the full VETA heading without the supervisor typing anything in the
          field.
        </p>

        {locked ? (
          <div className="mt-4 rounded-xl border border-[#dae3e0] bg-[#f1f3f4] px-4 py-3.5">
            <p className="text-[13px] font-bold text-[#3c4c58]">Record locked</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[#5b6b78]">
              This assessment was submitted and is read-only. Corrections require an Administrator
              override.
            </p>
          </div>
        ) : null}

        {canAssess ? (
          <div className="mt-5 flex flex-col gap-2.5">
            {trackInstruments.map((instrument) =>
              instrument.submitted ? (
                <div
                  key={instrument.code}
                  className="flex min-h-[52px] items-center justify-between rounded-xl border border-[#dae3e0] bg-[#f1f3f4] px-4"
                >
                  <span className="text-[15px] font-semibold text-[#3c4c58]">
                    {instrument.label}
                  </span>
                  <span className="text-[13px] font-bold text-[#1c6650]">Submitted ✓</span>
                </div>
              ) : (
                <a
                  key={instrument.code}
                  href={`/trainee/${id}/mark/${instrument.code}`}
                  className="focus:outline-accent flex min-h-[52px] items-center justify-center rounded-xl bg-[#12665b] text-[15px] font-bold text-white focus:outline focus:outline-[3px] focus:outline-offset-2"
                >
                  Start {instrument.label}
                </a>
              ),
            )}
          </div>
        ) : null}
      </div>
    </main>
  );
}

function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#eceff0] p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm">
        <p className="text-teal-mid text-[12px] font-extrabold tracking-[0.7px]">TRAINEE</p>
        <h1 className="mt-2 text-[22px] font-bold text-neutral-900">Not found</h1>
        <a
          href="/home"
          className="text-teal-mid mt-6 flex min-h-[48px] items-center justify-center rounded-xl border border-[#ccd7d4] text-[15px] font-semibold"
        >
          Back to route list
        </a>
      </div>
    </main>
  );
}
