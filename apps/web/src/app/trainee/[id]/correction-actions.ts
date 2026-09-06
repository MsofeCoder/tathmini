'use server';

import { revalidatePath } from 'next/cache';
import { changeField, isNoChange, validateRequestedValue } from '@/lib/admin/change-requests';
import { isUuid } from '@/lib/admin/validation';
import { createClient } from '@/lib/supabase/server';

export type CorrectionResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * A supervisor asking for a trainee's particular to be corrected.
 *
 * They cannot write to `trainees` — only a Super Administrator can, and that
 * stays true. What they can do is say what is wrong, from the one place where
 * it is obvious: standing in front of the trainee whose e-mail address belongs
 * to somebody else.
 *
 * The request is inserted under the supervisor's own session, so
 * `trainee_change_requests_insert` (migration 0030) is what permits it: their
 * own name, status pending, and only for a trainee they are actually assigned
 * to. None of those is checked here for security — they are checked here so the
 * message is readable when it fails.
 */
export async function requestTraineeCorrection(
  _prev: CorrectionResult | null,
  formData: FormData,
): Promise<CorrectionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Your session has expired. Sign in again.' };

  const traineeId = String(formData.get('traineeId') ?? '');
  const fieldKey = String(formData.get('field') ?? '');
  const requestedRaw = String(formData.get('requestedValue') ?? '');
  const reason = String(formData.get('reason') ?? '')
    .trim()
    .replace(/\s+/g, ' ');

  if (!isUuid(traineeId)) return { ok: false, error: 'That trainee could not be identified.' };

  const field = changeField(fieldKey);
  if (!field) return { ok: false, error: 'Choose which particular is wrong.' };

  const checked = validateRequestedValue(fieldKey, requestedRaw);
  if (!checked.ok) return { ok: false, error: checked.error };

  if (reason.length < 8) {
    return {
      ok: false,
      error: 'Say briefly how you know — the Administrator has to act on this without you there.',
    };
  }
  if (reason.length > 500) return { ok: false, error: 'Keep it under 500 characters.' };

  // The requestable columns, named literally: a template-built select string
  // is opaque to supabase-js's typed query parser, and the column is chosen
  // from CHANGE_FIELDS anyway, so nothing is gained by building it.
  const { data: trainee } = await supabase
    .from('trainees')
    .select(
      'id, name, registration_number, course, occupation, institution, mode_of_study, district, region, email, phone',
    )
    .eq('id', traineeId)
    .maybeSingle();

  if (!trainee) return { ok: false, error: 'That trainee could not be found.' };

  const current = (trainee as unknown as Record<string, unknown>)[field.column];
  const currentValue = current === null || current === undefined ? null : String(current);

  if (isNoChange(currentValue, checked.value)) {
    return {
      ok: false,
      error: `The register already holds that for ${field.label.toLowerCase()} — nothing to change.`,
    };
  }

  const { error } = await supabase.from('trainee_change_requests').insert({
    trainee_id: traineeId,
    field: fieldKey,
    current_value: currentValue,
    requested_value: checked.value,
    reason,
    status: 'pending',
    requested_by_id: user.id,
  });

  if (error) {
    // The table does not exist yet — migration 0030 has not been applied.
    if (error.code === '42P01' || error.message.includes('trainee_change_requests')) {
      return {
        ok: false,
        error:
          'Corrections are not switched on yet. Tell the Administrator directly for now — nothing was sent.',
      };
    }
    if (error.code === '42501') {
      return { ok: false, error: 'You can only request a correction for a trainee you assess.' };
    }
    return { ok: false, error: `That could not be sent: ${error.message}` };
  }

  revalidatePath(`/trainee/${traineeId}`);
  return {
    ok: true,
    message:
      'Sent to the Administrator. The register does not change until they apply it, so keep assessing as normal.',
  };
}
