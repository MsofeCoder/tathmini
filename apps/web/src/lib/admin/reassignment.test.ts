import { describe, expect, it } from 'vitest';
import {
  blockReasonText,
  planRouteMove,
  planSlotReassignment,
  type MoveCandidate,
} from './reassignment';

const A1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const A2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const NEW = 'aaaaaaaa-0000-4000-8000-000000000003';

function candidate(over: Partial<MoveCandidate> = {}): MoveCandidate {
  return {
    traineeId: 't1',
    traineeName: 'ASHA JUMA',
    hasSubmittedMarkInSlot: false,
    otherSlotSupervisorId: A2,
    ...over,
  };
}

describe('planSlotReassignment', () => {
  it('moves every trainee with nothing in the way', () => {
    const plan = planSlotReassignment(
      [candidate({ traineeId: 't1' }), candidate({ traineeId: 't2' })],
      NEW,
    );
    expect(plan.move).toEqual(['t1', 't2']);
    expect(plan.blocked).toEqual([]);
  });

  it('refuses to move a slot that already carries a submitted mark', () => {
    const plan = planSlotReassignment(
      [candidate({ traineeId: 't1', hasSubmittedMarkInSlot: true })],
      NEW,
    );
    expect(plan.move).toEqual([]);
    expect(plan.blocked).toEqual([
      { traineeId: 't1', traineeName: 'ASHA JUMA', reason: 'submitted-mark' },
    ]);
  });

  it('refuses to put one supervisor in both slots for the same trainee', () => {
    const plan = planSlotReassignment(
      [candidate({ traineeId: 't1', otherSlotSupervisorId: NEW })],
      NEW,
    );
    expect(plan.move).toEqual([]);
    expect(plan.blocked[0]?.reason).toBe('already-other-slot');
  });

  it('moves what it can and reports what it could not, rather than failing wholesale', () => {
    const plan = planSlotReassignment(
      [
        candidate({ traineeId: 't1' }),
        candidate({ traineeId: 't2', hasSubmittedMarkInSlot: true, traineeName: 'B' }),
        candidate({ traineeId: 't3', otherSlotSupervisorId: NEW, traineeName: 'C' }),
        candidate({ traineeId: 't4' }),
      ],
      NEW,
    );
    expect(plan.move).toEqual(['t1', 't4']);
    expect(plan.blocked.map((b) => b.traineeId)).toEqual(['t2', 't3']);
  });

  it('reports a submitted mark first when a trainee is blocked twice over', () => {
    const plan = planSlotReassignment(
      [candidate({ hasSubmittedMarkInSlot: true, otherSlotSupervisorId: NEW })],
      NEW,
    );
    expect(plan.blocked[0]?.reason).toBe('submitted-mark');
  });

  it('has readable text for each reason', () => {
    expect(blockReasonText('submitted-mark')).toContain('submitted mark');
    expect(blockReasonText('already-other-slot')).toContain('other slot');
  });
});

describe('planRouteMove', () => {
  const base = {
    submittedMarkCount: 0,
    destinationA1Id: A1,
    destinationA2Id: A2,
    destinationRouteId: 'r2',
    currentRouteId: 'r1',
  };

  it('returns the destination route’s two assessors', () => {
    expect(planRouteMove(base)).toEqual({ ok: true, a1: A1, a2: A2 });
  });

  it('refuses a move once any mark has been submitted, in either slot', () => {
    const decision = planRouteMove({ ...base, submittedMarkCount: 1 });
    expect(decision.ok).toBe(false);
  });

  it('refuses a route that is missing a supervisor', () => {
    expect(planRouteMove({ ...base, destinationA2Id: null }).ok).toBe(false);
    expect(planRouteMove({ ...base, destinationA1Id: null }).ok).toBe(false);
  });

  it('refuses a route whose two slots are the same person', () => {
    expect(planRouteMove({ ...base, destinationA2Id: A1 }).ok).toBe(false);
  });

  it('refuses a move to the route the trainee is already on', () => {
    expect(planRouteMove({ ...base, destinationRouteId: 'r1' }).ok).toBe(false);
  });
});
