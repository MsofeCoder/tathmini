import type { SupabaseClient } from '@supabase/supabase-js';
import type { CriterionRow } from '@/lib/marking';

export interface AssessorMarks {
  supervisorName: string;
  submittedAt: string | null;
  total: number | null;
  itemsByCriterionId: Map<string, { score: number; comment: string | null }>;
}

export interface InstrumentReport {
  id: string;
  code: string;
  label: string;
  maxTotal: number;
  criteria: CriterionRow[];
  bySlot: { a1: AssessorMarks | null; a2: AssessorMarks | null };
}

export interface ReportTrainee {
  name: string;
  registrationNumber: string | null;
  occupation: string;
  course: string;
  modeOfStudy: string | null;
  institution: string;
  region: string | null;
  district: string | null;
  email: string | null;
  phone: string | null;
  track: 'TP' | 'IPT';
}

export interface ReportResult {
  id: string;
  theoryTotal: number | null;
  practicalTotal: number | null;
  total: number | null;
  max: number;
  pct: number | null;
  grade: string | null;
  gpa: number | null;
  classOfAward: string | null;
  competent: boolean | null;
  lockedAt: string;
}

export interface ReportData {
  trainee: ReportTrainee;
  result: ReportResult;
  instruments: InstrumentReport[];
}

/**
 * Assembles everything the report templates need, all through the caller's
 * own authenticated Supabase client — never a service-role bypass (see
 * migration 0014's RLS: `reports_select`/assessment_marks/results are all
 * scoped to is_assigned_to_trainee(), same as every other read in the app).
 * Returns null if the trainee doesn't exist, isn't visible to the caller,
 * or the result isn't locked yet — a report is only ever generated from a
 * result both assessors have actually finalized.
 */
export async function getReportData(
  supabase: SupabaseClient,
  traineeId: string,
): Promise<ReportData | null> {
  const [traineeRes, resultRes] = await Promise.all([
    supabase
      .from('trainees')
      .select(
        'name, registration_number, occupation, course, mode_of_study, institution, region, district, email, phone, track',
      )
      .eq('id', traineeId)
      .maybeSingle(),
    supabase.from('results').select('*').eq('trainee_id', traineeId).maybeSingle(),
  ]);

  if (!traineeRes.data || !resultRes.data || !resultRes.data.locked_at) {
    return null;
  }

  const track = traineeRes.data.track as 'TP' | 'IPT';

  const [instrumentsRes, criteriaRes, marksRes] = await Promise.all([
    supabase.from('instruments').select('id, code, label, max_total').eq('track', track),
    supabase
      .from('criteria')
      .select(
        'id, instrument_id, section_code, section_label, section_max, item_code, item_label, item_max, order_index',
      )
      .order('order_index'),
    supabase
      .from('assessment_marks')
      .select('id, instrument_id, slot, total, submitted_at, supervisor:users(name)')
      .eq('trainee_id', traineeId)
      .not('submitted_at', 'is', null),
  ]);

  const instrumentIds = new Set((instrumentsRes.data ?? []).map((i) => i.id));
  const markIds = (marksRes.data ?? []).map((m) => m.id);

  const itemsRes = markIds.length
    ? await supabase
        .from('assessment_mark_items')
        .select('assessment_mark_id, criterion_id, score, comment')
        .in('assessment_mark_id', markIds)
    : { data: [] };

  const itemsByMarkId = new Map<string, Map<string, { score: number; comment: string | null }>>();
  for (const item of itemsRes.data ?? []) {
    const byCriterion = itemsByMarkId.get(item.assessment_mark_id) ?? new Map();
    byCriterion.set(item.criterion_id, { score: Number(item.score), comment: item.comment });
    itemsByMarkId.set(item.assessment_mark_id, byCriterion);
  }

  const criteriaByInstrument = new Map<string, CriterionRow[]>();
  for (const row of criteriaRes.data ?? []) {
    if (!instrumentIds.has(row.instrument_id)) continue;
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

  const instruments: InstrumentReport[] = (instrumentsRes.data ?? []).map((instrument) => {
    const bySlot: InstrumentReport['bySlot'] = { a1: null, a2: null };
    for (const mark of marksRes.data ?? []) {
      if (mark.instrument_id !== instrument.id) continue;
      const slot = mark.slot as 'a1' | 'a2';
      const supervisorName =
        (mark.supervisor as unknown as { name: string } | null)?.name ?? 'Unknown supervisor';
      bySlot[slot] = {
        supervisorName,
        submittedAt: mark.submitted_at,
        total: mark.total === null ? null : Number(mark.total),
        itemsByCriterionId: itemsByMarkId.get(mark.id) ?? new Map(),
      };
    }
    return {
      id: instrument.id,
      code: instrument.code,
      label: instrument.label,
      maxTotal: Number(instrument.max_total),
      criteria: (criteriaByInstrument.get(instrument.id) ?? []).sort(
        (a, b) => a.orderIndex - b.orderIndex,
      ),
      bySlot,
    };
  });

  return {
    trainee: {
      name: traineeRes.data.name,
      registrationNumber: traineeRes.data.registration_number,
      occupation: traineeRes.data.occupation,
      course: traineeRes.data.course,
      modeOfStudy: traineeRes.data.mode_of_study,
      institution: traineeRes.data.institution,
      region: traineeRes.data.region,
      district: traineeRes.data.district,
      email: traineeRes.data.email,
      phone: traineeRes.data.phone,
      track,
    },
    result: {
      id: resultRes.data.id,
      theoryTotal: resultRes.data.theory_total === null ? null : Number(resultRes.data.theory_total),
      practicalTotal:
        resultRes.data.practical_total === null ? null : Number(resultRes.data.practical_total),
      total: resultRes.data.total === null ? null : Number(resultRes.data.total),
      max: Number(resultRes.data.max),
      pct: resultRes.data.pct === null ? null : Number(resultRes.data.pct),
      grade: resultRes.data.grade,
      gpa: resultRes.data.gpa === null ? null : Number(resultRes.data.gpa),
      classOfAward: resultRes.data.class_of_award,
      competent: resultRes.data.competent,
      lockedAt: resultRes.data.locked_at,
    },
    instruments,
  };
}
