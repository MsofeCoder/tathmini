import { describe, expect, it } from 'vitest';
import {
  assessorActivity,
  gradeDistribution,
  percent,
  routeProgress,
  traineeCompletion,
  verdictSplit,
  type MarkLike,
  type TraineeLike,
} from './overview';

const INSTRUMENTS = new Map([
  ['TP', 2],
  ['IPT', 1],
]);

const trainees: TraineeLike[] = [
  { id: 't1', name: 'ONE', track: 'TP', routeId: 'r1' },
  { id: 't2', name: 'TWO', track: 'TP', routeId: 'r1' },
  { id: 't3', name: 'THREE', track: 'IPT', routeId: 'r2' },
];

function mark(traineeId: string, supervisorId: string, slot: 'a1' | 'a2'): MarkLike {
  return { traineeId, supervisorId, slot, instrumentId: 'i1' };
}

describe('traineeCompletion', () => {
  it('is locked once the result is locked, whatever the counts say', () => {
    expect(traineeCompletion({ submitted: 1, expected: 4, lockedAt: '2026-09-06' })).toBe('locked');
  });

  it('is partial with any submitted mark, and not-started with none', () => {
    expect(traineeCompletion({ submitted: 1, expected: 4, lockedAt: null })).toBe('partial');
    expect(traineeCompletion({ submitted: 0, expected: 4, lockedAt: null })).toBe('not-started');
  });
});

describe('routeProgress', () => {
  const routes = [
    { id: 'r1', code: 'TP ROUTE 1', a1Name: 'A', a2Name: 'B' },
    { id: 'r2', code: 'IPT ROUTE 1', a1Name: 'C', a2Name: null },
  ];

  it('expects both assessors on every instrument the track requires', () => {
    const [ipt] = routeProgress({
      routes: [routes[1]!],
      trainees,
      marks: [],
      lockedTraineeIds: new Set(),
      instrumentsPerTrack: INSTRUMENTS,
    });
    // One IPT trainee: one instrument, two assessors.
    expect(ipt?.marksExpected).toBe(2);

    const [tp] = routeProgress({
      routes: [routes[0]!],
      trainees,
      marks: [],
      lockedTraineeIds: new Set(),
      instrumentsPerTrack: INSTRUMENTS,
    });
    // Two TP trainees: two instruments each, two assessors.
    expect(tp?.marksExpected).toBe(8);
  });

  it('counts locked, partial and not-started separately', () => {
    const [tp] = routeProgress({
      routes: [routes[0]!],
      trainees,
      marks: [mark('t2', 's1', 'a1')],
      lockedTraineeIds: new Set(['t1']),
      instrumentsPerTrack: INSTRUMENTS,
    });
    expect(tp).toMatchObject({ trainees: 2, locked: 1, partial: 1, notStarted: 0 });
  });

  it('reports completion against marks owed, not trainees touched', () => {
    const [tp] = routeProgress({
      routes: [routes[0]!],
      trainees,
      marks: [mark('t1', 's1', 'a1'), mark('t1', 's2', 'a2')],
      lockedTraineeIds: new Set(),
      instrumentsPerTrack: INSTRUMENTS,
    });
    expect(tp?.marksSubmitted).toBe(2);
    expect(tp?.percentComplete).toBe(25); // 2 of 8
  });

  it('sorts routes the way a human reads them, so ROUTE 2 precedes ROUTE 10', () => {
    const progress = routeProgress({
      routes: [
        { id: 'a', code: 'TP ROUTE 10', a1Name: null, a2Name: null },
        { id: 'b', code: 'TP ROUTE 2', a1Name: null, a2Name: null },
      ],
      trainees: [],
      marks: [],
      lockedTraineeIds: new Set(),
      instrumentsPerTrack: INSTRUMENTS,
    });
    expect(progress.map((r) => r.code)).toEqual(['TP ROUTE 2', 'TP ROUTE 10']);
  });

  it('survives an empty route without dividing by zero', () => {
    const [empty] = routeProgress({
      routes: [{ id: 'r9', code: 'TP ROUTE 9', a1Name: null, a2Name: null }],
      trainees: [],
      marks: [],
      lockedTraineeIds: new Set(),
      instrumentsPerTrack: INSTRUMENTS,
    });
    expect(empty?.percentComplete).toBe(0);
  });
});

describe('assessorActivity', () => {
  const base = {
    supervisors: [
      { id: 's1', name: 'BEHIND' },
      { id: 's2', name: 'AHEAD' },
    ],
    assignments: [
      { traineeId: 't1', supervisorId: 's1' },
      { traineeId: 't2', supervisorId: 's1' },
      { traineeId: 't1', supervisorId: 's2' },
      { traineeId: 't2', supervisorId: 's2' },
    ],
    trainees,
    routeCodeById: new Map([
      ['r1', 'TP ROUTE 1'],
      ['r2', 'IPT ROUTE 1'],
    ]),
    instrumentsPerTrack: INSTRUMENTS,
  };

  it('counts what each assessor owes from their own assignments', () => {
    const rows = assessorActivity({ ...base, marks: [] });
    // Two TP trainees, two instruments each.
    expect(rows.every((r) => r.expected === 4)).toBe(true);
  });

  it('puts the assessor furthest behind at the top', () => {
    const rows = assessorActivity({
      ...base,
      marks: [mark('t1', 's2', 'a2'), mark('t2', 's2', 'a2')],
    });
    expect(rows[0]?.name).toBe('BEHIND');
    expect(rows[0]?.percentComplete).toBe(0);
    expect(rows[1]?.percentComplete).toBe(50);
  });

  it('leaves out anyone with nothing assigned rather than showing them at 0%', () => {
    const rows = assessorActivity({
      ...base,
      supervisors: [...base.supervisors, { id: 's3', name: 'NO TRAINEES' }],
      marks: [],
    });
    expect(rows.map((r) => r.name)).not.toContain('NO TRAINEES');
  });

  it('lists the routes an assessor actually holds trainees on', () => {
    const rows = assessorActivity({ ...base, marks: [] });
    expect(rows[0]?.routeCodes).toEqual(['TP ROUTE 1']);
  });
});

describe('gradeDistribution', () => {
  it('keeps the printed VETA scale order, not size order', () => {
    const dist = gradeDistribution([
      { grade: 'C' },
      { grade: 'C' },
      { grade: 'C' },
      { grade: 'A' },
    ]);
    expect(dist.map((d) => d.grade)).toEqual(['A', 'B', 'C', 'D', 'F']);
    expect(dist.find((d) => d.grade === 'C')?.count).toBe(3);
  });

  it('shows a zero for a grade nobody scored, so the gap is visible', () => {
    const dist = gradeDistribution([{ grade: 'A' }]);
    expect(dist.find((d) => d.grade === 'F')?.count).toBe(0);
  });

  it('ignores results with no grade yet', () => {
    const dist = gradeDistribution([{ grade: null }, { grade: 'B' }]);
    expect(dist.reduce((total, d) => total + d.count, 0)).toBe(1);
  });

  it('shows an unexpected grade after the scale rather than dropping it', () => {
    const dist = gradeDistribution([{ grade: 'E' }]);
    expect(dist.at(-1)).toEqual({ grade: 'E', count: 1 });
  });
});

describe('verdictSplit', () => {
  it('separates competent, not competent and not yet decided', () => {
    expect(
      verdictSplit([
        { competent: true },
        { competent: true },
        { competent: false },
        { competent: null },
      ]),
    ).toEqual({ competent: 2, notCompetent: 1, undecided: 1 });
  });
});

describe('percent', () => {
  it('rounds, and never divides by zero', () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(0, 0)).toBe(0);
    expect(percent(4, 4)).toBe(100);
  });
});
