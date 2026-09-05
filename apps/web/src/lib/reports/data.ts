import type { SupabaseClient } from '@supabase/supabase-js';
import type { CriterionRow } from '@/lib/marking';

export interface AssessorMarks {
  supervisorName: string;
  submittedAt: string | null;
  total: number | null;
  itemsByCriterionId: Map<string, { score: number; comment: string | null }>;
  /**
   * One comment per criterion, keyed by section code — the TP forms' merged
   * COMMENTS cell (migration 0019). Empty for IPT, which has no such column,
   * and empty for anything submitted before 2026-09-05, when the comment was
   * still attached to each sub-criterion. The renderer falls back to joining
   * `itemsByCriterionId` comments in that case, so older reports print
   * unchanged.
   */
  commentsBySectionCode: Map<string, string>;
  /** SUPERVISOR'S GENERAL COMMENTS. Null on marks submitted before 0019. */
  generalComment: string | null;
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
  /**
   * Null until BOTH assessors have submitted every instrument in the track.
   * While null, `total`/`pct`/`grade`/`competent` on this row are computed
   * by recompute_result() as an average over whichever marks exist so far —
   * i.e. provisional, and they will change when the second assessor submits.
   * The consolidated page is therefore only rendered once this is set.
   */
  lockedAt: string | null;
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
 * Returns null if the trainee doesn't exist, isn't visible to the caller, or
 * no submitted marks are readable for the requested slot.
 *
 * `slot` scopes the report to ONE assessor's own assessment. That is the
 * normal case: each assessor previews and submits their own report without
 * waiting for the other, so a colleague who is sick or unreachable can never
 * block a submission (the College's requirement, 2026-09-05). Each assessor
 * page in the VETA form is self-contained — it carries its own TOTAL MARKS
 * and its own COMPETENT / NOT COMPETENT box computed from that assessor's
 * marks alone — so a single-slot report is a complete, valid VETA document,
 * not a truncated one.
 *
 * Deliberately NOT relaxed: this still reads through the caller's own
 * authenticated client, so RLS remains the thing that decides what is
 * visible. An assessor cannot pass slot:'a2' to read a colleague's marks
 * before both have submitted — `assessment_marks_select`'s
 * `submitted_slot_count(...) >= 2` gate returns nothing (AGENTS.md rule 1:
 * authorisation is a policy, never an argument).
 */
export async function getReportData(
  supabase: SupabaseClient,
  traineeId: string,
  options: { slot?: 'a1' | 'a2' } = {},
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

  // No locked_at requirement: a supervisor's own finished assessment is a
  // reportable document in its own right. A `results` row exists from the
  // first submitted mark (recompute_result() upserts it), so its absence
  // means nothing has been submitted for this trainee at all.
  if (!traineeRes.data || !resultRes.data) {
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
      .select(
        'id, instrument_id, slot, total, submitted_at, general_comment, supervisor:users(name)',
      )
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

  const sectionCommentsRes = markIds.length
    ? await supabase
        .from('assessment_mark_section_comments')
        .select('assessment_mark_id, section_code, comment')
        .in('assessment_mark_id', markIds)
    : { data: [] };

  const sectionCommentsByMarkId = new Map<string, Map<string, string>>();
  for (const row of sectionCommentsRes.data ?? []) {
    const bySection = sectionCommentsByMarkId.get(row.assessment_mark_id) ?? new Map();
    bySection.set(row.section_code, row.comment);
    sectionCommentsByMarkId.set(row.assessment_mark_id, bySection);
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
      if (options.slot && slot !== options.slot) continue;
      const supervisorName =
        (mark.supervisor as unknown as { name: string } | null)?.name ?? 'Unknown supervisor';
      bySlot[slot] = {
        supervisorName,
        submittedAt: mark.submitted_at,
        total: mark.total === null ? null : Number(mark.total),
        itemsByCriterionId: itemsByMarkId.get(mark.id) ?? new Map(),
        commentsBySectionCode: sectionCommentsByMarkId.get(mark.id) ?? new Map(),
        generalComment: (mark as { general_comment?: string | null }).general_comment ?? null,
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

  // Nothing readable for this slot — an unsubmitted assessment, or another
  // assessor's slot that RLS correctly withheld. Either way there is no
  // document to render, and returning an empty shell would print a VETA form
  // with blank score columns over a real trainee's name.
  const hasAnyMarks = instruments.some((i) => i.bySlot.a1 !== null || i.bySlot.a2 !== null);
  if (!hasAnyMarks) {
    return null;
  }

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
      theoryTotal:
        resultRes.data.theory_total === null ? null : Number(resultRes.data.theory_total),
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
