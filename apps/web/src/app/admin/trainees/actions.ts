'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminWriter, type ActionResult } from '@/lib/admin/session';
import { planRouteMove, planTraineeSlotChange } from '@/lib/admin/reassignment';
import { isUuid, validateTraineeParticulars } from '@/lib/admin/validation';

/**
 * Trainee corrections — the register work that is currently done by writing
 * a migration by hand (see packages/db/migrations/0023, 0026 and the IPT
 * roster update). Particulars and route membership only: nothing here can
 * touch a mark, a total or a verdict.
 */

export async function updateTraineeParticulars(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await requireAdminWriter();
  if (!auth.ok) return auth;

  const traineeId = String(formData.get('traineeId') ?? '');
  if (!isUuid(traineeId)) return { ok: false, error: 'That trainee could not be identified.' };

  const checked = validateTraineeParticulars({
    name: String(formData.get('name') ?? ''),
    registrationNumber: String(formData.get('registrationNumber') ?? ''),
    course: String(formData.get('course') ?? ''),
    occupation: String(formData.get('occupation') ?? ''),
    institution: String(formData.get('institution') ?? ''),
    modeOfStudy: String(formData.get('modeOfStudy') ?? ''),
    district: String(formData.get('district') ?? ''),
    region: String(formData.get('region') ?? ''),
    email: String(formData.get('email') ?? ''),
    phone: String(formData.get('phone') ?? ''),
  });
  if (!checked.ok) return { ok: false, error: checked.error };

  const { error } = await auth.session.supabase
    .from('trainees')
    .update(checked.value)
    .eq('id', traineeId);

  if (error) {
    // The most likely refusal by far, and the least self-explanatory.
    if (error.code === '23505') {
      return {
        ok: false,
        error: 'Another trainee already holds that registration number — they are unique.',
      };
    }
    return { ok: false, error: `The change was refused: ${error.message}` };
  }

  revalidatePath(`/admin/trainees/${traineeId}`);
  revalidatePath('/admin/trainees');
  revalidatePath('/admin');
  return { ok: true, message: 'Particulars saved. The change is on the audit trail.' };
}

/**
 * Moving one trainee to another route.
 *
 * This changes BOTH assessors at once, so it is stricter than a route slot
 * swap: any submitted mark at all blocks it. Migration 0028 refuses an IPT
 * route move on exactly this ground — a route move re-points the supervisors,
 * and a submitted mark belongs to the assessor who made it.
 */
export async function moveTraineeToRoute(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await requireAdminWriter();
  if (!auth.ok) return auth;
  const supabase = auth.session.supabase;

  const traineeId = String(formData.get('traineeId') ?? '');
  const destinationRouteId = String(formData.get('routeId') ?? '');
  if (!isUuid(traineeId)) return { ok: false, error: 'That trainee could not be identified.' };
  if (!isUuid(destinationRouteId)) return { ok: false, error: 'Choose a route first.' };

  const [traineeRes, destinationRes, marksRes] = await Promise.all([
    supabase.from('trainees').select('id, name, route_id').eq('id', traineeId).maybeSingle(),
    supabase
      .from('routes')
      .select('id, code, supervisor_a1_id, supervisor_a2_id')
      .eq('id', destinationRouteId)
      .maybeSingle(),
    supabase
      .from('assessment_marks')
      .select('id', { count: 'exact', head: true })
      .eq('trainee_id', traineeId)
      .not('submitted_at', 'is', null),
  ]);

  const trainee = traineeRes.data;
  const destination = destinationRes.data;
  if (!trainee) return { ok: false, error: 'That trainee no longer exists.' };
  if (!destination) return { ok: false, error: 'That route no longer exists.' };

  const decision = planRouteMove({
    submittedMarkCount: marksRes.count ?? 0,
    destinationA1Id: destination.supervisor_a1_id,
    destinationA2Id: destination.supervisor_a2_id,
    destinationRouteId: destination.id,
    currentRouteId: trainee.route_id,
  });
  if (!decision.ok) return { ok: false, error: decision.error };

  const { error: moveError } = await supabase
    .from('trainees')
    .update({ route_id: destination.id })
    .eq('id', traineeId);
  if (moveError) return { ok: false, error: `The move was refused: ${moveError.message}` };

  /**
   * `assignments` is what RLS reads, so the move is not real until these
   * follow. Deleting both slots and inserting the new pair is deliberate:
   * updating in place can transiently put one supervisor in both slots and
   * trip `assignments_trainee_supervisor_idx`, depending on which row moves
   * first.
   */
  const { error: clearError } = await supabase
    .from('assignments')
    .delete()
    .eq('trainee_id', traineeId);
  if (clearError) {
    return {
      ok: false,
      error: `The trainee was moved, but their old assessor assignments could not be cleared: ${clearError.message}`,
    };
  }

  const { error: insertError } = await supabase.from('assignments').insert([
    { trainee_id: traineeId, supervisor_id: decision.a1, slot: 'a1' },
    { trainee_id: traineeId, supervisor_id: decision.a2, slot: 'a2' },
  ]);
  if (insertError) {
    return {
      ok: false,
      error: `The trainee was moved, but the new assessors could not be assigned: ${insertError.message}. Reassign this trainee's slots before anyone marks them.`,
    };
  }

  revalidatePath(`/admin/trainees/${traineeId}`);
  revalidatePath('/admin/trainees');
  revalidatePath('/admin/routes');
  revalidatePath('/admin');

  return {
    ok: true,
    message: `${trainee.name} is now on ${destination.code}, with that route's two assessors.`,
  };
}

/**
 * Changing one assessor for one trainee, without moving them off their route.
 *
 * The route keeps its standing pair — `routes` is untouched — and only this
 * trainee's `assignments` row moves, which is what RLS reads. That asymmetry is
 * the feature: a supervisor who is ill, or a trainee placed with a specialist,
 * should not require forty other people to change assessor.
 *
 * A `reassignments` row is written alongside it, already resolved, so the
 * register carries who this slot was taken from and who it went to. The
 * append-only audit trail records the assignment change either way (log_audit()
 * fires on `assignments`), but it stores a table name and a row id, not the two
 * people involved.
 */
export async function reassignTraineeSlot(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await requireAdminWriter();
  if (!auth.ok) return auth;
  const supabase = auth.session.supabase;

  const traineeId = String(formData.get('traineeId') ?? '');
  const slotRaw = String(formData.get('slot') ?? '');
  const supervisorId = String(formData.get('supervisorId') ?? '');

  if (!isUuid(traineeId) || (slotRaw !== 'a1' && slotRaw !== 'a2')) {
    return { ok: false, error: 'That trainee or slot could not be identified.' };
  }
  const slot: 'a1' | 'a2' = slotRaw;
  if (!isUuid(supervisorId)) return { ok: false, error: 'Choose a supervisor first.' };

  const [traineeRes, supervisorRes, assignmentsRes, marksRes] = await Promise.all([
    supabase.from('trainees').select('id, name').eq('id', traineeId).maybeSingle(),
    supabase.from('users').select('id, name, role, active').eq('id', supervisorId).maybeSingle(),
    supabase.from('assignments').select('id, slot, supervisor_id').eq('trainee_id', traineeId),
    supabase
      .from('assessment_marks')
      .select('id', { count: 'exact', head: true })
      .eq('trainee_id', traineeId)
      .eq('slot', slot)
      .not('submitted_at', 'is', null),
  ]);

  const trainee = traineeRes.data;
  const supervisor = supervisorRes.data;
  if (!trainee) return { ok: false, error: 'That trainee no longer exists.' };
  if (!supervisor) return { ok: false, error: 'That account no longer exists.' };
  if (supervisor.role !== 'supervisor') {
    return { ok: false, error: 'Only a supervisor account can hold an assessor slot.' };
  }
  if (!supervisor.active) {
    return {
      ok: false,
      error: 'That account is deactivated. Reactivate it first, or choose someone else.',
    };
  }

  const assignments = (assignmentsRes.data ?? []) as {
    id: string;
    slot: 'a1' | 'a2';
    supervisor_id: string;
  }[];
  const current = assignments.find((row) => row.slot === slot) ?? null;
  const other = assignments.find((row) => row.slot !== slot) ?? null;

  const decision = planTraineeSlotChange({
    slot,
    currentSupervisorId: current?.supervisor_id ?? null,
    otherSlotSupervisorId: other?.supervisor_id ?? null,
    newSupervisorId: supervisorId,
    submittedMarksInSlot: marksRes.count ?? 0,
  });
  if (!decision.ok) return { ok: false, error: decision.error };

  const { error: writeError } = current
    ? await supabase
        .from('assignments')
        .update({ supervisor_id: supervisorId })
        .eq('id', current.id)
    : await supabase
        .from('assignments')
        .insert({ trainee_id: traineeId, supervisor_id: supervisorId, slot });

  if (writeError) return { ok: false, error: `The change was refused: ${writeError.message}` };

  if (decision.replaces) {
    // Provenance, not a workflow: an administrator's change is immediate, so the
    // row is filed already resolved rather than as a request awaiting an answer.
    const { error: recordError } = await supabase.from('reassignments').insert({
      trainee_id: traineeId,
      slot,
      from_supervisor_id: decision.replaces,
      to_supervisor_id: supervisorId,
      status: 'accepted',
      resolved_at: new Date().toISOString(),
    });
    if (recordError) {
      return {
        ok: true,
        message: `${supervisor.name} now assesses ${trainee.name} as ${
          slot === 'a1' ? 'Assessor 1' : 'Assessor 2'
        }. The change is live, but it could not be filed in the reassignment record: ${recordError.message}`,
      };
    }
  }

  revalidatePath(`/admin/trainees/${traineeId}`);
  revalidatePath('/admin/routes');
  revalidatePath('/admin');

  return {
    ok: true,
    message: `${supervisor.name} now assesses ${trainee.name} as ${
      slot === 'a1' ? 'Assessor 1' : 'Assessor 2'
    }. The route itself is unchanged.`,
  };
}
