'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireAdminWriter, type ActionResult } from '@/lib/admin/session';
import {
  blockReasonText,
  planSlotReassignment,
  type MoveCandidate,
} from '@/lib/admin/reassignment';
import { isUuid } from '@/lib/admin/validation';

/**
 * Changing which supervisor holds an assessor slot on a route.
 *
 * The `routes` row is the template; `assignments` is what RLS actually reads
 * to decide who may mark whom. Changing one without the other leaves a
 * register that says one thing and a permission system that does another, so
 * this action always does both — and reports honestly when it could only do
 * part of it.
 *
 * What it will not do is move a slot that already carries a submitted mark.
 * A mark belongs to the assessor who made it (`assessment_marks` is
 * append-only, AGENTS.md rule 2) and the result's two-slot average keeps
 * counting it. Those trainees are left alone and named in the result, rather
 * than the whole change being refused: on a 40-trainee route, "two of these
 * are already marked" is useful and "no" is not.
 */
const SLOT_COLUMN = { a1: 'supervisor_a1_id', a2: 'supervisor_a2_id' } as const;

/** PostgREST puts `in` lists in the query string, so they are chunked to keep the URL sane. */
const CHUNK = 100;

interface AssignmentRow {
  trainee_id: string;
  supervisor_id: string;
  slot: 'a1' | 'a2';
}

interface MarkRow {
  trainee_id: string;
  slot: 'a1' | 'a2';
  submitted_at: string | null;
}

export async function reassignRouteSlot(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await requireAdminWriter();
  if (!auth.ok) return auth;
  const supabase = auth.session.supabase;

  const routeId = String(formData.get('routeId') ?? '');
  const slotRaw = String(formData.get('slot') ?? '');
  const supervisorId = String(formData.get('supervisorId') ?? '');

  if (!isUuid(routeId) || (slotRaw !== 'a1' && slotRaw !== 'a2')) {
    return { ok: false, error: 'That route or slot could not be identified.' };
  }
  const slot: 'a1' | 'a2' = slotRaw;
  if (!isUuid(supervisorId)) return { ok: false, error: 'Choose a supervisor first.' };

  const [routeRes, supervisorRes] = await Promise.all([
    supabase
      .from('routes')
      .select('id, code, supervisor_a1_id, supervisor_a2_id')
      .eq('id', routeId)
      .maybeSingle(),
    supabase.from('users').select('id, name, role, active').eq('id', supervisorId).maybeSingle(),
  ]);

  const route = routeRes.data;
  const supervisor = supervisorRes.data;
  if (!route) return { ok: false, error: 'That route no longer exists.' };
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

  const otherSlotSupervisorOnRoute =
    slot === 'a1' ? route.supervisor_a2_id : route.supervisor_a1_id;
  if (otherSlotSupervisorOnRoute === supervisorId) {
    return {
      ok: false,
      error:
        'That supervisor already holds the other slot on this route. Two assessors means two people.',
    };
  }
  if (route[SLOT_COLUMN[slot]] === supervisorId) {
    return { ok: false, error: 'That supervisor already holds this slot.' };
  }

  const { data: traineeRows } = await supabase
    .from('trainees')
    .select('id, name')
    .eq('route_id', routeId);

  const trainees = (traineeRows ?? []) as { id: string; name: string }[];
  const traineeIds = trainees.map((t) => t.id);

  const [assignments, marks] = await Promise.all([
    fetchByTrainee<AssignmentRow>(
      supabase,
      'assignments',
      'trainee_id, supervisor_id, slot',
      traineeIds,
    ),
    fetchByTrainee<MarkRow>(
      supabase,
      'assessment_marks',
      'trainee_id, slot, submitted_at',
      traineeIds,
    ),
  ]);

  const otherSlot: 'a1' | 'a2' = slot === 'a1' ? 'a2' : 'a1';
  const otherSlotSupervisorByTrainee = new Map<string, string>();
  const alreadyHasRowInSlot = new Set<string>();
  for (const row of assignments) {
    if (row.slot === otherSlot) otherSlotSupervisorByTrainee.set(row.trainee_id, row.supervisor_id);
    if (row.slot === slot) alreadyHasRowInSlot.add(row.trainee_id);
  }

  const markedInSlot = new Set(
    marks.filter((row) => row.slot === slot && row.submitted_at).map((row) => row.trainee_id),
  );

  const candidates: MoveCandidate[] = trainees.map((t) => ({
    traineeId: t.id,
    traineeName: t.name,
    hasSubmittedMarkInSlot: markedInSlot.has(t.id),
    otherSlotSupervisorId: otherSlotSupervisorByTrainee.get(t.id) ?? null,
  }));

  const plan = planSlotReassignment(candidates, supervisorId);

  // The route row goes first: it is the template every route screen and
  // every later roster import reads, and it is correct even for the
  // trainees whose own assignments cannot follow it.
  const { error: routeError } = await supabase
    .from('routes')
    .update({ [SLOT_COLUMN[slot]]: supervisorId })
    .eq('id', routeId);
  if (routeError) {
    return { ok: false, error: `The route could not be updated: ${routeError.message}` };
  }

  const toUpdate = plan.move.filter((id) => alreadyHasRowInSlot.has(id));
  const toInsert = plan.move.filter((id) => !alreadyHasRowInSlot.has(id));

  for (let i = 0; i < toUpdate.length; i += CHUNK) {
    const { error } = await supabase
      .from('assignments')
      .update({ supervisor_id: supervisorId })
      .eq('slot', slot)
      .in('trainee_id', toUpdate.slice(i, i + CHUNK));
    if (error) {
      return {
        ok: false,
        error: `The route was updated, but the assessor assignments were not: ${error.message}`,
      };
    }
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from('assignments').insert(
      toInsert.map((traineeId) => ({
        trainee_id: traineeId,
        supervisor_id: supervisorId,
        slot,
      })),
    );
    if (error) {
      return {
        ok: false,
        error: `The route was updated, but ${toInsert.length} trainees had no assignment for this slot and one could not be created: ${error.message}`,
      };
    }
  }

  revalidatePath('/admin/routes');
  revalidatePath('/admin/trainees');
  revalidatePath('/admin');

  const moved = plan.move.length;
  let message = `${supervisor.name} now holds slot ${slot.toUpperCase()} on ${route.code}. ${moved} ${
    moved === 1 ? 'trainee was' : 'trainees were'
  } reassigned.`;

  if (plan.blocked.length > 0) {
    const named = plan.blocked
      .slice(0, 4)
      .map((b) => `${b.traineeName} (${blockReasonText(b.reason)})`)
      .join('; ');
    const rest = plan.blocked.length > 4 ? `, and ${plan.blocked.length - 4} more` : '';
    message += ` ${plan.blocked.length} left unchanged: ${named}${rest}.`;
  }

  return { ok: true, message };
}

async function fetchByTrainee<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  traineeIds: readonly string[],
): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < traineeIds.length; i += CHUNK) {
    const { data } = await supabase
      .from(table)
      .select(columns)
      .in('trainee_id', traineeIds.slice(i, i + CHUNK));
    rows.push(...((data ?? []) as unknown as T[]));
  }
  return rows;
}
