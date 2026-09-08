'use server';

import { revalidatePath } from 'next/cache';
import {
  assertComplete,
  iptCriterionMarkSchema,
  pointsCriterionMarkSchema,
} from '@tathmini/shared';
import { todayInEat, validateAssessmentDate } from '@/lib/assessment-date';
import { createClient } from '@/lib/supabase/server';
import type { SubmitAssessmentInput, SubmitAssessmentResult } from '@/lib/submission';

/**
 * Three inserts, in a fixed order:
 *
 *   1. the assessment_marks row for this (trainee, instrument, slot),
 *      carrying the supervisor's general comment;
 *   2. any per-criterion comments (TP only);
 *   3. every assessment_mark_items row, in a SINGLE insert.
 *
 * The order is not stylistic. assessment_mark_items_finalize fires on that
 * last statement, rejects it unless the item count matches the instrument's
 * real criteria count, and on a complete match stamps total/submitted_at —
 * which closes the window that
 * assessment_mark_section_comments_insert requires. Comments written after
 * the items are refused.
 *
 * (This was the two-insert contract in HANDOFF.md until the comment surfaces
 * moved from sub-criterion to criterion on 2026-09-05.)
 *
 * Re-validates completeness and every mark server-side (AGENTS.md rule 3:
 * never trust a client-computed total, and by extension never trust a
 * client's claim that a form is complete or that a score is in range) even
 * though the client already gates on the same rules.
 *
 * Called from two places — the marking form directly, and OutboxDrainer
 * replaying a submission that was queued offline — so it must stay safe to
 * call more than once for the same assessment. It is: a completed mark
 * returns `already_submitted` rather than inserting anything.
 */
export async function submitAssessment(
  input: SubmitAssessmentInput,
): Promise<SubmitAssessmentResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      code: 'signed_out',
      error: 'You have been signed out. Sign in again and retry.',
    };
  }

  const expectedIds = input.criteria.map((c) => c.id);
  const providedIds = input.items.map((item) => item.criterionId);
  const { complete, missing } = assertComplete(expectedIds, providedIds);
  if (!complete) {
    return {
      ok: false,
      code: 'incomplete',
      error: `${missing.length} criterion${missing.length === 1 ? '' : 'a'} still unscored.`,
    };
  }

  const maxById = new Map(input.criteria.map((c) => [c.id, c.itemMax]));
  for (const item of input.items) {
    const max = maxById.get(item.criterionId);
    if (max == null) {
      return {
        ok: false,
        code: 'invalid',
        error: 'That criterion does not belong to this instrument.',
      };
    }
    const schema =
      input.instrumentCode === 'ipt' ? iptCriterionMarkSchema : pointsCriterionMarkSchema(max);
    const parsed = schema.safeParse({
      criterionId: item.criterionId,
      score: item.score,
      comment: item.comment.trim() || undefined,
    });
    if (!parsed.success) {
      return {
        ok: false,
        code: 'invalid',
        error: parsed.error.issues[0]?.message ?? 'A score is invalid.',
      };
    }
  }

  /**
   * The date is re-checked here, not trusted from the client — the same rule
   * as every score above. A submission can also be replayed from the outbox
   * days after it was queued, so "not in the future" is judged now, against
   * today, rather than against the day the supervisor tapped Submit.
   */
  const checkedDate = validateAssessmentDate(input.assessedOn ?? '', todayInEat());
  if (!checkedDate.ok) {
    return { ok: false, code: 'invalid', error: checkedDate.error };
  }

  // Reuse an existing unfinished row for this (trainee, instrument, slot)
  // rather than re-inserting — a prior attempt may have crashed between the
  // two inserts, and assessment_marks_trainee_instrument_slot_idx is unique.
  // RLS's assessment_marks_select lets the caller always read their own
  // supervisor_id row regardless of submitted_at.
  const { data: existing } = await supabase
    .from('assessment_marks')
    .select('id, submitted_at')
    .eq('trainee_id', input.traineeId)
    .eq('instrument_id', input.instrumentId)
    .eq('supervisor_id', user.id)
    .maybeSingle();

  if (existing?.submitted_at) {
    return {
      ok: false,
      code: 'already_submitted',
      error: 'This assessment has already been submitted.',
    };
  }

  let markId = existing?.id;
  if (!markId) {
    let { data: inserted, error: insertError } = await supabase
      .from('assessment_marks')
      .insert(markRow(input, user.id, true))
      .select('id')
      .single();

    /**
     * `assessed_on` arrives with migration 0034. If that has not been applied
     * where this is running, Postgres rejects the whole insert for an unknown
     * column — and a supervisor standing in a workshop would be told their
     * assessment failed, over a date.
     *
     * So the column is dropped and the insert retried once. The assessment
     * lands either way; only the date is lost, and the report falls back to
     * the submission date exactly as it did before this feature. Once the
     * migration is applied this retry stops happening on its own, with no
     * deployment. See lib/assessment-date.ts and migration 0034.
     */
    if (insertError && isUnknownColumn(insertError, 'assessed_on')) {
      const retry = await supabase
        .from('assessment_marks')
        .insert(markRow(input, user.id, false))
        .select('id')
        .single();
      inserted = retry.data;
      insertError = retry.error;
    }

    if (insertError || !inserted) {
      return {
        ok: false,
        code: 'server',
        error: insertError?.message ?? 'Could not start the submission.',
      };
    }
    markId = inserted.id;
  }

  // BEFORE the items, and this order is load-bearing: inserting the items
  // fires assessment_mark_items_finalize, which stamps submitted_at, and
  // assessment_mark_section_comments_insert (migration 0025) only admits a row
  // while the mark is still open. Written after the items it would be
  // rejected, and the supervisor would lose every criterion comment they
  // wrote with no error that named the cause.
  //
  // ON CONFLICT DO NOTHING because this action is replayable: the outbox
  // retries a submission whose first attempt may have crashed between the
  // inserts. `ignoreDuplicates` needs only the INSERT grant, which matters —
  // there is deliberately no UPDATE grant on this table.
  const sectionComments = input.sectionComments
    .map((s) => ({ sectionCode: s.sectionCode, comment: s.comment.trim() }))
    .filter((s) => s.comment.length > 0);

  if (sectionComments.length > 0) {
    const { error: commentsError } = await supabase.from('assessment_mark_section_comments').upsert(
      sectionComments.map((s) => ({
        assessment_mark_id: markId,
        section_code: s.sectionCode,
        comment: s.comment,
      })),
      { onConflict: 'assessment_mark_id,section_code', ignoreDuplicates: true },
    );
    if (commentsError) {
      return { ok: false, code: 'server', error: commentsError.message };
    }
  }

  const { error: itemsError } = await supabase.from('assessment_mark_items').insert(
    input.items.map((item) => ({
      assessment_mark_id: markId,
      criterion_id: item.criterionId,
      score: item.score,
      comment: item.comment.trim() || null,
    })),
  );

  if (itemsError) {
    return { ok: false, code: 'server', error: itemsError.message };
  }

  revalidatePath(`/trainee/${input.traineeId}`);
  revalidatePath('/home');
  return { ok: true };
}

/**
 * The `assessment_marks` row, with or without the date column.
 *
 * `general_comment` and `assessed_on` are both only settable here —
 * `assessment_marks` has no UPDATE grant for any role, so everything the
 * supervisor asserts about this assessment is append-only along with the
 * scores.
 */
function markRow(input: SubmitAssessmentInput, supervisorId: string, withDate: boolean) {
  const row: Record<string, unknown> = {
    trainee_id: input.traineeId,
    instrument_id: input.instrumentId,
    supervisor_id: supervisorId,
    slot: input.slot,
    general_comment: input.generalComment.trim() || null,
  };
  if (withDate) row.assessed_on = input.assessedOn;
  return row;
}

/**
 * Postgres 42703 is "column does not exist"; PostgREST reports the same thing
 * as PGRST204 when its schema cache has no such column. The column name is
 * checked too, so an unrelated missing column is never silently swallowed —
 * that would turn a real schema fault into a submission that quietly dropped
 * data.
 */
function isUnknownColumn(error: { code?: string; message?: string }, column: string): boolean {
  const known = error.code === '42703' || error.code === 'PGRST204';
  return known && (error.message ?? '').includes(column);
}
