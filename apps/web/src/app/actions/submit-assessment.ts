'use server';

import { revalidatePath } from 'next/cache';
import {
  assertComplete,
  iptCriterionMarkSchema,
  pointsCriterionMarkSchema,
} from '@tathmini/shared';
import { createClient } from '@/lib/supabase/server';
import type { SubmitAssessmentInput, SubmitAssessmentResult } from '@/lib/submission';

/**
 * The exact two-insert contract from HANDOFF.md: one assessment_marks row
 * for this (trainee, instrument, slot), then every assessment_mark_items row
 * in a single insert — the assessment_mark_items_finalize trigger rejects
 * the whole statement unless the item count matches the instrument's real
 * criteria count, and only a complete match stamps total/submitted_at.
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
    const { data: inserted, error: insertError } = await supabase
      .from('assessment_marks')
      .insert({
        trainee_id: input.traineeId,
        instrument_id: input.instrumentId,
        supervisor_id: user.id,
        slot: input.slot,
      })
      .select('id')
      .single();
    if (insertError || !inserted) {
      return {
        ok: false,
        code: 'server',
        error: insertError?.message ?? 'Could not start the submission.',
      };
    }
    markId = inserted.id;
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
