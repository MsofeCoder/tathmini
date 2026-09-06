'use server';

import { revalidatePath } from 'next/cache';
import { changeField, validateRequestedValue } from '@/lib/admin/change-requests';
import { requireAdminWriter, type ActionResult } from '@/lib/admin/session';
import { isUuid } from '@/lib/admin/validation';

/**
 * Deciding a correction request.
 *
 * Applying one is two writes that must both land: the register changes, and the
 * request is marked applied. The register goes first — if marking the request
 * fails afterwards, an administrator sees a still-pending request whose change
 * has already been made and can decline it, which is recoverable. The reverse
 * order would leave a request marked applied that never touched the register,
 * which is a lie the audit trail would carry forever.
 *
 * The requested value is re-validated HERE, not trusted from when it was typed.
 * A request may have sat for days; the rules it was checked against are the same
 * ones, but the register underneath it may have moved.
 */
export async function applyChangeRequest(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await requireAdminWriter();
  if (!auth.ok) return auth;
  const supabase = auth.session.supabase;

  const requestId = String(formData.get('requestId') ?? '');
  if (!isUuid(requestId)) return { ok: false, error: 'That request could not be identified.' };

  const { data: request, error: loadError } = await supabase
    .from('trainee_change_requests')
    .select('id, trainee_id, field, requested_value, status')
    .eq('id', requestId)
    .maybeSingle();

  if (loadError) return { ok: false, error: notEnabled(loadError) ?? loadError.message };
  if (!request) return { ok: false, error: 'That request no longer exists.' };
  if (request.status !== 'pending') {
    return { ok: false, error: 'That request has already been decided.' };
  }

  const field = changeField(request.field as string);
  if (!field)
    return { ok: false, error: 'That request names a particular this system cannot change.' };

  const checked = validateRequestedValue(
    request.field as string,
    (request.requested_value as string | null) ?? '',
  );
  if (!checked.ok) {
    return {
      ok: false,
      error: `The requested value is not valid, so it was not applied: ${checked.error}`,
    };
  }

  const { error: writeError } = await supabase
    .from('trainees')
    .update({ [field.column]: checked.value })
    .eq('id', request.trainee_id as string);

  if (writeError) {
    if (writeError.code === '23505') {
      return {
        ok: false,
        error: 'Another trainee already holds that registration number — nothing was changed.',
      };
    }
    if (writeError.code === '23514') {
      return {
        ok: false,
        error:
          'The register refused that: a trainee must keep either an e-mail address or a phone number. Nothing was changed.',
      };
    }
    return { ok: false, error: `The register refused that change: ${writeError.message}` };
  }

  const { error: markError } = await supabase
    .from('trainee_change_requests')
    .update({
      status: 'applied',
      decided_by_id: auth.session.userId,
      decided_at: new Date().toISOString(),
      decision_note: String(formData.get('note') ?? '').trim() || null,
    })
    .eq('id', requestId);

  revalidatePath('/admin/requests');
  revalidatePath(`/admin/trainees/${request.trainee_id as string}`);
  revalidatePath('/admin/trainees');
  revalidatePath('/admin');

  if (markError) {
    return {
      ok: true,
      message: `The register was updated, but the request could not be closed: ${markError.message}. Decline it to clear it — the change is already made.`,
    };
  }

  return {
    ok: true,
    message: `${field.label} updated. The change is on the audit trail, and the supervisor who asked can see it was applied.`,
  };
}

export async function declineChangeRequest(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await requireAdminWriter();
  if (!auth.ok) return auth;

  const requestId = String(formData.get('requestId') ?? '');
  if (!isUuid(requestId)) return { ok: false, error: 'That request could not be identified.' };

  const note = String(formData.get('note') ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (note.length < 4) {
    return {
      ok: false,
      error: 'Say why, briefly — the supervisor who raised this will read it.',
    };
  }

  const { error } = await auth.session.supabase
    .from('trainee_change_requests')
    .update({
      status: 'declined',
      decided_by_id: auth.session.userId,
      decided_at: new Date().toISOString(),
      decision_note: note,
    })
    .eq('id', requestId)
    .eq('status', 'pending');

  if (error) return { ok: false, error: notEnabled(error) ?? `That failed: ${error.message}` };

  revalidatePath('/admin/requests');
  revalidatePath('/admin');
  return {
    ok: true,
    message: 'Declined. The register is unchanged and the reason is on the record.',
  };
}

/** Migration 0030 has not been applied — said in words an administrator can act on. */
function notEnabled(error: { code?: string; message: string }): string | null {
  if (error.code === '42P01' || error.message.includes('trainee_change_requests')) {
    return 'Correction requests are not enabled yet: migration 0030 has not been applied to the database.';
  }
  return null;
}
