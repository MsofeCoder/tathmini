import { describe, expect, it } from 'vitest';
import type { CriterionRow } from './marking';
import { buildPhasePayload, phaseComplete, tpReadyToSubmit, type TpSubmitPhase } from './tp-submit';

/**
 * When a TP assessment becomes sendable.
 *
 * The two lessons are marked separately and each one ends by saving, so the
 * question "is this finished?" is asked in two different places — the last
 * page of a lesson, and the trainee profile. Both ask these functions, and
 * this file is what stops the two from ever disagreeing.
 */

const criterion = (id: string, sectionCode: string, itemMax = 2): CriterionRow => ({
  id,
  sectionCode,
  sectionLabel: sectionCode === '1' ? 'LESSON PREPARATION' : 'TEACHING METHODS',
  sectionMax: 6,
  itemCode: id,
  itemLabel: 'An item',
  itemMax,
  orderIndex: Number(id.replace(/\D/g, '')),
});

const theory: TpSubmitPhase = {
  instrumentId: 'i-theory',
  code: 'tp_theory',
  label: 'TP Theory',
  criteria: [criterion('t1', '1'), criterion('t2', '2')],
};

const practical: TpSubmitPhase = {
  instrumentId: 'i-practical',
  code: 'tp_practical',
  label: 'TP Practical',
  criteria: [criterion('p1', '1')],
};

const draft = (marks: Record<string, number>) => ({
  marks: Object.fromEntries(
    Object.entries(marks).map(([id, score]) => [id, { score, comment: '' }]),
  ),
  sectionComments: {},
  generalComment: '',
});

describe('phaseComplete', () => {
  it('needs every criterion scored', () => {
    expect(phaseComplete(theory.criteria, draft({ t1: 2 }).marks)).toBe(false);
    expect(phaseComplete(theory.criteria, draft({ t1: 2, t2: 1 }).marks)).toBe(true);
  });

  // Zero is a mark; absent is not, and is never treated as zero.
  it('counts a zero as scored', () => {
    expect(phaseComplete(practical.criteria, draft({ p1: 0 }).marks)).toBe(true);
  });

  it('is false for a form with no criteria — an empty form is not a finished one', () => {
    expect(phaseComplete([], {})).toBe(false);
  });
});

describe('tpReadyToSubmit', () => {
  it('needs BOTH lessons complete', () => {
    const drafts = { 'i-theory': draft({ t1: 2, t2: 2 }), 'i-practical': draft({}) };
    expect(tpReadyToSubmit([theory, practical], drafts)).toBe(false);
  });

  it('is ready once both are', () => {
    const drafts = { 'i-theory': draft({ t1: 2, t2: 2 }), 'i-practical': draft({ p1: 1 }) };
    expect(tpReadyToSubmit([theory, practical], drafts)).toBe(true);
  });

  // A lesson already submitted is not in the list, so a supervisor finishing
  // Practical alone is ready as soon as Practical is.
  it('is ready on the remaining lesson when the other is already submitted', () => {
    expect(tpReadyToSubmit([practical], { 'i-practical': draft({ p1: 3 }) })).toBe(true);
  });

  it('is never ready with nothing to submit', () => {
    expect(tpReadyToSubmit([], {})).toBe(false);
  });

  it('is not ready when a lesson has no draft on this phone at all', () => {
    expect(tpReadyToSubmit([theory, practical], { 'i-theory': draft({ t1: 2, t2: 2 }) })).toBe(
      false,
    );
  });
});

describe('buildPhasePayload', () => {
  it('carries one statement for one instrument, with its own section comments', () => {
    const payload = buildPhasePayload({
      traineeId: 't1',
      slot: 'a2',
      phase: theory,
      draft: { ...draft({ t1: 2, t2: 0.5 }), sectionComments: { '1': 'Plan the practice.' } },
    });

    expect(payload.instrumentId).toBe('i-theory');
    expect(payload.instrumentCode).toBe('tp_theory');
    expect(payload.slot).toBe('a2');
    expect(payload.items).toEqual([
      { criterionId: 't1', score: 2, comment: '' },
      { criterionId: 't2', score: 0.5, comment: '' },
    ]);
    // One comment row per section of THIS instrument, present even when empty
    // — the paper form's merged COMMENTS cell exists whether or not it is
    // written in.
    expect(payload.sectionComments).toEqual([
      { sectionCode: '1', comment: 'Plan the practice.' },
      { sectionCode: '2', comment: '' },
    ]);
  });
});
