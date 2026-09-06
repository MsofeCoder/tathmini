/**
 * Who may be moved, and who must not be.
 *
 * Reassigning an assessor slot or moving a trainee between routes rewrites
 * `assignments`, which is the RLS source of truth for who may mark whom. Two
 * things make a move unsafe, and both are silent failures rather than loud
 * ones, so they are decided here — in a pure function with tests — instead of
 * inside a Server Action where they would be discovered in production.
 *
 * 1. A SUBMITTED MARK. `assessment_marks` is append-only (AGENTS.md rule 2)
 *    and a mark belongs to the assessor who made it; it cannot be reassigned.
 *    Moving the slot out from under a submitted mark leaves the register
 *    saying one supervisor is responsible while the record says another, and
 *    the result's two-slot average keeps counting the original. Migration
 *    0028's own safety query refuses an IPT route move for exactly this
 *    reason.
 *
 * 2. THE SAME PERSON IN BOTH SLOTS. `assignments_trainee_supervisor_idx` is a
 *    unique index, so this is a constraint violation rather than a policy
 *    choice — but caught here it is a sentence explaining which trainees were
 *    skipped, and caught in Postgres it is a failed statement in the middle
 *    of a partly-applied move.
 */
export type MoveBlockReason = 'submitted-mark' | 'already-other-slot';

export interface MoveCandidate {
  traineeId: string;
  traineeName: string;
  /** True if this trainee has any submitted assessment_mark in the slot being moved. */
  hasSubmittedMarkInSlot: boolean;
  /** Who holds the trainee's OTHER slot right now, if anyone. */
  otherSlotSupervisorId: string | null;
}

export interface BlockedMove {
  traineeId: string;
  traineeName: string;
  reason: MoveBlockReason;
}

export interface MovePlan {
  move: string[];
  blocked: BlockedMove[];
}

export function planSlotReassignment(
  candidates: readonly MoveCandidate[],
  newSupervisorId: string,
): MovePlan {
  const move: string[] = [];
  const blocked: BlockedMove[] = [];

  for (const candidate of candidates) {
    if (candidate.hasSubmittedMarkInSlot) {
      blocked.push({
        traineeId: candidate.traineeId,
        traineeName: candidate.traineeName,
        reason: 'submitted-mark',
      });
      continue;
    }
    if (candidate.otherSlotSupervisorId === newSupervisorId) {
      blocked.push({
        traineeId: candidate.traineeId,
        traineeName: candidate.traineeName,
        reason: 'already-other-slot',
      });
      continue;
    }
    move.push(candidate.traineeId);
  }

  return { move, blocked };
}

export function blockReasonText(reason: MoveBlockReason): string {
  return reason === 'submitted-mark'
    ? 'already has a submitted mark in this slot'
    : 'is already assessed by that supervisor in the other slot';
}

/**
 * Moving one trainee to a different route. Stricter than a slot swap: the
 * trainee changes BOTH assessors at once, so any submitted mark at all — in
 * either slot — blocks it, not just a mark in the slot being touched.
 */
export interface RouteMoveInput {
  submittedMarkCount: number;
  destinationA1Id: string | null;
  destinationA2Id: string | null;
  destinationRouteId: string;
  currentRouteId: string;
}

export type RouteMoveDecision = { ok: true; a1: string; a2: string } | { ok: false; error: string };

export function planRouteMove(input: RouteMoveInput): RouteMoveDecision {
  if (input.destinationRouteId === input.currentRouteId) {
    return { ok: false, error: 'That is the route the trainee is already on.' };
  }
  if (input.submittedMarkCount > 0) {
    return {
      ok: false,
      error:
        'This trainee already has a submitted mark. A mark belongs to the assessor who made it and cannot be reassigned, so the route cannot be changed.',
    };
  }
  if (!input.destinationA1Id || !input.destinationA2Id) {
    return {
      ok: false,
      error:
        'That route does not have both assessor slots filled yet. Assign its two supervisors first.',
    };
  }
  if (input.destinationA1Id === input.destinationA2Id) {
    return {
      ok: false,
      error:
        'That route has the same supervisor in both slots — fix the route before moving anyone onto it.',
    };
  }
  return { ok: true, a1: input.destinationA1Id, a2: input.destinationA2Id };
}

/**
 * Changing ONE assessor for ONE trainee, leaving them on their route.
 *
 * This is the case the route template cannot express: a supervisor falls ill, or
 * a trainee is placed with a specialist for one instrument, and a single slot has
 * to move without disturbing the other forty people on the route. It writes
 * `assignments` only — `routes` keeps its standing pair, because the route has not
 * changed, and the next roster import must not be told otherwise.
 *
 * The two refusals are the same ones a route-wide slot change carries, for the
 * same reasons: a submitted mark in this slot belongs to the assessor who made it,
 * and one person cannot hold both slots for the same trainee
 * (`assignments_trainee_supervisor_idx`).
 */
export interface TraineeSlotChangeInput {
  slot: 'a1' | 'a2';
  /** Who holds this slot now, if anyone. */
  currentSupervisorId: string | null;
  /** Who holds the trainee's OTHER slot, if anyone. */
  otherSlotSupervisorId: string | null;
  newSupervisorId: string;
  /** Submitted marks by anyone in THIS slot for this trainee. */
  submittedMarksInSlot: number;
}

export type TraineeSlotChangeDecision =
  { ok: true; supervisorId: string; replaces: string | null } | { ok: false; error: string };

export function planTraineeSlotChange(input: TraineeSlotChangeInput): TraineeSlotChangeDecision {
  const label = input.slot === 'a1' ? 'Assessor 1' : 'Assessor 2';

  if (input.newSupervisorId === input.currentSupervisorId) {
    return { ok: false, error: `That supervisor already holds ${label} for this trainee.` };
  }
  if (input.submittedMarksInSlot > 0) {
    return {
      ok: false,
      error: `${label} has already submitted a mark for this trainee. A mark belongs to the assessor who made it and cannot be handed on, so this slot can no longer be changed.`,
    };
  }
  if (input.newSupervisorId === input.otherSlotSupervisorId) {
    return {
      ok: false,
      error:
        'That supervisor already assesses this trainee in the other slot. Two assessors means two people.',
    };
  }
  return { ok: true, supervisorId: input.newSupervisorId, replaces: input.currentSupervisorId };
}
