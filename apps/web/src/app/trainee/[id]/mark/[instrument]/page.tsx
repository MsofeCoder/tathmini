import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { CriterionRow } from '@/lib/marking';
import { MarkingForm } from './marking-form';

const INSTRUMENT_LABELS: Record<string, string> = {
  tp_theory: 'Theory',
  tp_practical: 'Practical Lesson',
  ipt: 'IPT Assessment',
};

const TRACK_FOR_INSTRUMENT: Record<string, 'TP' | 'IPT'> = {
  tp_theory: 'TP',
  tp_practical: 'TP',
  ipt: 'IPT',
};

/**
 * Criterion-by-criterion marking (ROADMAP.md Phase 1) — one route reused for
 * all three instruments, driven entirely by what's live in `instruments`/
 * `criteria` (never a hardcoded criteria list in the app). Every guard here
 * mirrors an RLS policy that would reject the write anyway (AGENTS.md rule
 * 1); this is the courtesy UI layer, not the enforcement.
 */
export default async function MarkTraineePage({
  params,
}: {
  params: Promise<{ id: string; instrument: string }>;
}) {
  const { id, instrument } = await params;
  const instrumentLabel = INSTRUMENT_LABELS[instrument];
  if (!instrumentLabel) notFound();

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

  const { data: trainee } = await supabase
    .from('trainees')
    .select('id, name, track')
    .eq('id', id)
    .maybeSingle();
  if (!trainee)
    return <ScreenMessage title="Not found" body="This trainee record does not exist." />;
  if (trainee.track !== TRACK_FOR_INSTRUMENT[instrument]) notFound();

  const { data: assignment } = await supabase
    .from('assignments')
    .select('slot')
    .eq('trainee_id', id)
    .eq('supervisor_id', user.id)
    .maybeSingle();
  if (!assignment) {
    return (
      <ScreenMessage
        title="Not assigned"
        body="You are not one of this trainee's assigned assessors."
        traineeId={id}
      />
    );
  }

  const { data: instrumentRow } = await supabase
    .from('instruments')
    .select('id, code, max_total')
    .eq('code', instrument)
    .single();
  if (!instrumentRow) notFound();

  const [{ data: criteriaRows }, { data: existingMark }] = await Promise.all([
    supabase
      .from('criteria')
      .select(
        'id, section_code, section_label, section_max, item_code, item_label, item_max, order_index',
      )
      .eq('instrument_id', instrumentRow.id)
      .order('order_index'),
    supabase
      .from('assessment_marks')
      .select('submitted_at')
      .eq('trainee_id', id)
      .eq('instrument_id', instrumentRow.id)
      .eq('supervisor_id', user.id)
      .maybeSingle(),
  ]);

  if (existingMark?.submitted_at) {
    return (
      <ScreenMessage
        title="Already submitted"
        body={`Your ${instrumentLabel} assessment for ${trainee.name} was already submitted. Submitted marks are append-only — an Administrator override is required to change them.`}
        traineeId={id}
      />
    );
  }

  // Postgres numeric columns come back from PostgREST as strings.
  const criteria: CriterionRow[] = (criteriaRows ?? []).map((r) => ({
    id: r.id,
    sectionCode: r.section_code,
    sectionLabel: r.section_label,
    sectionMax: Number(r.section_max),
    itemCode: r.item_code,
    itemLabel: r.item_label,
    itemMax: Number(r.item_max),
    orderIndex: r.order_index,
  }));

  return (
    <MarkingForm
      traineeId={id}
      traineeName={trainee.name}
      instrumentId={instrumentRow.id}
      instrumentCode={instrumentRow.code}
      instrumentLabel={instrumentLabel}
      slot={assignment.slot as 'a1' | 'a2'}
      criteria={criteria}
    />
  );
}

function ScreenMessage({
  title,
  body,
  traineeId,
}: {
  title: string;
  body: string;
  traineeId?: string;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#eceff0] p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm">
        <p className="text-teal-mid text-[12px] font-extrabold tracking-[0.7px]">ASSESSMENT</p>
        <h1 className="mt-2 text-[22px] font-bold text-neutral-900">{title}</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-[#5b6b78]">{body}</p>
        <a
          href={traineeId ? `/trainee/${traineeId}` : '/home'}
          className="text-teal-mid mt-6 flex min-h-[48px] items-center justify-center rounded-xl border border-[#ccd7d4] text-[15px] font-semibold"
        >
          {traineeId ? '‹ Back to trainee' : 'Back to route list'}
        </a>
      </div>
    </main>
  );
}
