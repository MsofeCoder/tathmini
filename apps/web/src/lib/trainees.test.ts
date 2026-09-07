import { describe, expect, it } from 'vitest';
import {
  deriveStatus,
  initials,
  statusMeta,
  statusPlain,
  trackChipStyle,
  traineeParticulars,
  trackPointsLabel,
  routeProgress,
  matchesFilter,
  traineeCategory,
  type RouteProgressInput,
} from './trainees';

describe('deriveStatus', () => {
  it('is locked once results.locked_at is set, regardless of own submission count', () => {
    expect(
      deriveStatus({ lockedAt: '2026-09-04T00:00:00Z', ownSubmittedCount: 0, requiredCount: 2 }),
    ).toBe('locked');
  });

  it('is partial once the signed-in supervisor has submitted every required instrument, but not locked', () => {
    expect(deriveStatus({ lockedAt: null, ownSubmittedCount: 2, requiredCount: 2 })).toBe(
      'partial',
    );
  });

  it('is pending when the supervisor has submitted nothing yet', () => {
    expect(deriveStatus({ lockedAt: null, ownSubmittedCount: 0, requiredCount: 2 })).toBe(
      'pending',
    );
  });

  it('is pending when the supervisor has submitted some but not all required instruments (e.g. TP theory only)', () => {
    expect(deriveStatus({ lockedAt: null, ownSubmittedCount: 1, requiredCount: 2 })).toBe(
      'pending',
    );
  });

  it('treats a zero-instrument track as never reaching partial from submissions alone', () => {
    expect(deriveStatus({ lockedAt: null, ownSubmittedCount: 0, requiredCount: 0 })).toBe(
      'pending',
    );
  });
});

describe('statusMeta / statusPlain', () => {
  it('matches the prototype verbatim for all three reachable states', () => {
    expect(statusMeta('locked')).toEqual({ bg: '#e2f0ea', fg: '#1c6650', short: '✓ Assessed' });
    expect(statusMeta('partial')).toEqual({
      bg: '#e6eefc',
      fg: '#243f7a',
      short: '◑ 1 of 2 assessors',
    });
    expect(statusMeta('pending')).toEqual({
      bg: '#eef1f3',
      fg: '#4d5f6c',
      short: '○ Not yet assessed',
    });

    expect(statusPlain('locked')).toBe('Assessed');
    expect(statusPlain('partial')).toBe('Awaiting 2nd assessor');
    expect(statusPlain('pending')).toBe('Not yet assessed');
  });
});

describe('initials', () => {
  it('takes the first letter of the first two words', () => {
    expect(initials('Evodius Kadason')).toBe('EK');
  });

  it('handles a single-word name', () => {
    expect(initials('Cher')).toBe('C');
  });

  it('collapses extra whitespace and ignores a third+ word', () => {
    expect(initials('  Mary   Jane  Watson ')).toBe('MJ');
  });
});

describe('trackChipStyle', () => {
  it('matches the prototype verbatim for both tracks', () => {
    expect(trackChipStyle('TP')).toEqual({ bg: '#e2f0ea', fg: '#1c6650' });
    expect(trackChipStyle('IPT')).toEqual({ bg: '#fff0d6', fg: '#6b4400' });
  });
});

describe('traineeParticulars', () => {
  const base = {
    registrationNumber: 'MVTTC/CAVT/2025/0001',
    occupation: 'Carpentry',
    course: 'CAVT',
    modeOfStudy: 'In-Campus',
    institution: 'Kilosa VTC',
    region: 'Morogoro',
    district: 'Kilosa',
    email: 'trainee@example.com',
    phone: null,
    assessedByLabel: 'J. Mwakalinga (Assessor 1 of 2)',
  };

  it('shows VTC + Email rows for TP, in the expected order', () => {
    expect(traineeParticulars({ ...base, track: 'TP' })).toEqual([
      { label: 'Registration No', value: 'MVTTC/CAVT/2025/0001' },
      { label: 'Occupation', value: 'Carpentry' },
      { label: 'Course', value: 'CAVT · In-Campus' },
      { label: 'VTC', value: 'Kilosa VTC' },
      { label: 'Region / District', value: 'Morogoro · Kilosa' },
      { label: 'Email', value: 'trainee@example.com' },
      { label: 'Assessed by', value: 'J. Mwakalinga (Assessor 1 of 2)' },
    ]);
  });

  it('shows Industry / Firm + Phone rows for IPT', () => {
    const rows = traineeParticulars({
      ...base,
      track: 'IPT',
      registrationNumber: null,
      email: null,
      phone: '0712345678',
    });
    expect(rows).toContainEqual({ label: 'Industry / Firm', value: 'Kilosa VTC' });
    expect(rows).toContainEqual({ label: 'Phone', value: '0712345678' });
    expect(rows).toContainEqual({ label: 'Registration No', value: '—' });
  });

  it('falls back to em dash for a missing registration number and missing contact', () => {
    const rows = traineeParticulars({
      ...base,
      track: 'TP',
      registrationNumber: null,
      email: null,
    });
    expect(rows).toContainEqual({ label: 'Registration No', value: '—' });
    expect(rows).toContainEqual({ label: 'Email', value: '—' });
  });

  it('drops the mode-of-study separator when it is null', () => {
    const rows = traineeParticulars({ ...base, track: 'TP', modeOfStudy: null });
    expect(rows).toContainEqual({ label: 'Course', value: 'CAVT' });
  });

  it('falls back to a single region/district value, or em dash, when only one or neither is set', () => {
    expect(
      traineeParticulars({ ...base, track: 'TP', region: 'Morogoro', district: null }),
    ).toContainEqual({ label: 'Region / District', value: 'Morogoro' });
    expect(
      traineeParticulars({ ...base, track: 'TP', region: null, district: null }),
    ).toContainEqual({ label: 'Region / District', value: '—' });
  });
});

describe('trackPointsLabel', () => {
  it('sums TP theory + practical maxima', () => {
    const maxima = new Map([
      ['tp_theory', 50],
      ['tp_practical', 50],
      ['ipt', 70],
    ]);
    expect(trackPointsLabel('TP', maxima)).toBe('TP · Theory 50 + Practical 50');
  });

  it('shows the single IPT max total', () => {
    const maxima = new Map([
      ['tp_theory', 50],
      ['tp_practical', 50],
      ['ipt', 70],
    ]);
    expect(trackPointsLabel('IPT', maxima)).toBe('IPT · 70 pts');
  });
});

describe('routeProgress', () => {
  const trainee = (over: Partial<RouteProgressInput> = {}): RouteProgressInput => ({
    status: 'pending',
    ownSubmittedCount: 0,
    requiredCount: 2,
    hasDraft: false,
    ...over,
  });

  it('counts a partial as assessed, not as outstanding', () => {
    // The real defect: a supervisor who had marked three of five trainees
    // saw "0 of 5 assessed · 5 still to assess", because 'partial' — their
    // own work done, waiting on the second assessor — fell through to
    // not-started.
    const progress = routeProgress([
      trainee({ status: 'partial', ownSubmittedCount: 2 }),
      trainee({ status: 'partial', ownSubmittedCount: 2 }),
      trainee({ status: 'partial', ownSubmittedCount: 1, requiredCount: 1 }),
      trainee(),
      trainee(),
    ]);

    expect(progress).toEqual({ assessed: 3, inProgress: 0, notStarted: 2, pct: 60 });
  });

  it('counts locked as assessed', () => {
    const progress = routeProgress([
      trainee({ status: 'locked', ownSubmittedCount: 2 }),
      trainee(),
    ]);

    expect(progress.assessed).toBe(1);
    expect(progress.notStarted).toBe(1);
  });

  it('counts a half-submitted multi-instrument track as in progress', () => {
    // TP theory submitted, practical not. deriveStatus() reports 'pending'
    // for this, indistinguishable from untouched without the raw counts.
    const progress = routeProgress([trainee({ ownSubmittedCount: 1, requiredCount: 2 })]);

    expect(progress).toEqual({ assessed: 0, inProgress: 1, notStarted: 0, pct: 0 });
  });

  it('counts a local draft as in progress', () => {
    // The only signal available for a single-instrument IPT trainee.
    const progress = routeProgress([trainee({ requiredCount: 1, hasDraft: true })]);

    expect(progress).toEqual({ assessed: 0, inProgress: 1, notStarted: 0, pct: 0 });
  });

  it('does not double-count a draft on an already-assessed trainee', () => {
    const progress = routeProgress([
      trainee({ status: 'partial', ownSubmittedCount: 2, hasDraft: true }),
    ]);

    expect(progress).toEqual({ assessed: 1, inProgress: 0, notStarted: 0, pct: 100 });
  });

  it('reports 100% when every trainee is assessed', () => {
    const progress = routeProgress([
      trainee({ status: 'locked', ownSubmittedCount: 2 }),
      trainee({ status: 'partial', ownSubmittedCount: 2 }),
    ]);

    expect(progress.pct).toBe(100);
    expect(progress.notStarted).toBe(0);
  });

  it('handles an empty route without dividing by zero', () => {
    expect(routeProgress([])).toEqual({ assessed: 0, inProgress: 0, notStarted: 0, pct: 0 });
  });

  it('rounds the percentage to a whole number', () => {
    const progress = routeProgress([
      trainee({ status: 'locked', ownSubmittedCount: 2 }),
      trainee(),
      trainee(),
    ]);

    expect(progress.pct).toBe(33);
  });
});

describe('traineeCategory', () => {
  const base = {
    status: 'pending' as const,
    ownSubmittedCount: 0,
    requiredCount: 2,
    hasDraft: false,
  };

  it('counts a locked or partial trainee as assessed', () => {
    expect(traineeCategory({ ...base, status: 'locked' })).toBe('assessed');
    expect(traineeCategory({ ...base, status: 'partial' })).toBe('assessed');
  });

  it('counts a part-submitted track as in progress', () => {
    expect(traineeCategory({ ...base, ownSubmittedCount: 1 })).toBe('in-progress');
  });

  it('counts an unsent local draft as drafted', () => {
    expect(traineeCategory({ ...base, hasDraft: true })).toBe('drafted');
  });

  // Submitted work outranks a draft: to everyone but this phone, a trainee
  // whose theory is already in is in progress.
  it('prefers in progress over drafted when both are true', () => {
    expect(traineeCategory({ ...base, ownSubmittedCount: 1, hasDraft: true })).toBe('in-progress');
  });

  it('counts an untouched trainee as not started', () => {
    expect(traineeCategory(base)).toBe('not-started');
  });
});

describe('the filter buckets against the summary tiles', () => {
  // The pills and the tiles are read on the same screen at the same time, so
  // they must be arithmetically the same claim: drafted + in-progress is the
  // IN PROGRESS tile, and nothing may fall outside a bucket.
  it('splits the IN PROGRESS tile into drafted and in-progress, and nothing else', () => {
    const trainees = [
      { status: 'locked' as const, ownSubmittedCount: 2, requiredCount: 2, hasDraft: false },
      { status: 'partial' as const, ownSubmittedCount: 2, requiredCount: 2, hasDraft: false },
      { status: 'pending' as const, ownSubmittedCount: 1, requiredCount: 2, hasDraft: false },
      { status: 'pending' as const, ownSubmittedCount: 0, requiredCount: 1, hasDraft: true },
      { status: 'pending' as const, ownSubmittedCount: 0, requiredCount: 2, hasDraft: false },
    ];
    const counts = { assessed: 0, 'in-progress': 0, drafted: 0, 'not-started': 0 };
    for (const t of trainees) counts[traineeCategory(t)] += 1;

    const tiles = routeProgress(trainees);
    expect(counts.assessed).toBe(tiles.assessed);
    expect(counts['in-progress'] + counts.drafted).toBe(tiles.inProgress);
    expect(counts['not-started']).toBe(tiles.notStarted);
    expect(counts.assessed + counts['in-progress'] + counts.drafted + counts['not-started']).toBe(
      trainees.length,
    );
  });
});

describe('matchesFilter', () => {
  it('lets everything through on “all”', () => {
    expect(matchesFilter('all', 'drafted')).toBe(true);
    expect(matchesFilter('assessed', 'drafted')).toBe(false);
    expect(matchesFilter('drafted', 'drafted')).toBe(true);
  });
});
