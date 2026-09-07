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
    draftProgress: 'none',
    reportSent: false,
    ...over,
  });

  it('counts submitted-but-unsent as in progress, not as assessed', () => {
    // Corrected 2026-09-07. These three have every instrument submitted, so
    // the College has their marks — but no report has been sent, and the
    // report is what the result travels on. They are drafts, and the headline
    // must not tell a supervisor the job is finished while the last step is
    // outstanding.
    const progress = routeProgress([
      trainee({ status: 'partial', ownSubmittedCount: 2 }),
      trainee({ status: 'partial', ownSubmittedCount: 2 }),
      trainee({ status: 'partial', ownSubmittedCount: 1, requiredCount: 1 }),
      trainee(),
      trainee(),
    ]);

    expect(progress).toEqual({ assessed: 0, inProgress: 3, notStarted: 2, pct: 0 });
  });

  it('counts a trainee as assessed once the report has gone', () => {
    const progress = routeProgress([
      trainee({ status: 'partial', ownSubmittedCount: 2, reportSent: true }),
      trainee({ status: 'partial', ownSubmittedCount: 2 }),
      trainee(),
      trainee(),
    ]);

    expect(progress).toEqual({ assessed: 1, inProgress: 1, notStarted: 2, pct: 25 });
  });

  it('does not count a locked result as assessed while the report is unsent', () => {
    // Both assessors are in and Postgres has locked the result — but this
    // supervisor still owes the report, and that is an action they can take.
    // Calling it assessed would hide the one thing left to do.
    const progress = routeProgress([
      trainee({ status: 'locked', ownSubmittedCount: 2 }),
      trainee({ status: 'locked', ownSubmittedCount: 2, reportSent: true }),
      trainee(),
    ]);

    expect(progress.assessed).toBe(1);
    expect(progress.inProgress).toBe(1);
    expect(progress.notStarted).toBe(1);
  });

  it('counts a half-submitted multi-instrument track as in progress', () => {
    // TP theory submitted, practical not. deriveStatus() reports 'pending'
    // for this, indistinguishable from untouched without the raw counts.
    const progress = routeProgress([trainee({ ownSubmittedCount: 1, requiredCount: 2 })]);

    expect(progress).toEqual({ assessed: 0, inProgress: 1, notStarted: 0, pct: 0 });
  });

  it('counts a local draft as in progress, finished or not', () => {
    // The tile does not split the two; the filter pills do.
    const progress = routeProgress([trainee({ requiredCount: 1, draftProgress: 'complete' })]);

    expect(progress).toEqual({ assessed: 0, inProgress: 1, notStarted: 0, pct: 0 });
  });

  it('does not double-count a draft on an already-assessed trainee', () => {
    const progress = routeProgress([
      trainee({
        status: 'partial',
        ownSubmittedCount: 2,
        draftProgress: 'complete',
        reportSent: true,
      }),
    ]);

    expect(progress).toEqual({ assessed: 1, inProgress: 0, notStarted: 0, pct: 100 });
  });

  it('reports 100% when every report has been sent', () => {
    const progress = routeProgress([
      trainee({ status: 'locked', ownSubmittedCount: 2, reportSent: true }),
      trainee({ status: 'partial', ownSubmittedCount: 2, reportSent: true }),
    ]);

    expect(progress.pct).toBe(100);
    expect(progress.notStarted).toBe(0);
  });

  it('handles an empty route without dividing by zero', () => {
    expect(routeProgress([])).toEqual({ assessed: 0, inProgress: 0, notStarted: 0, pct: 0 });
  });

  it('rounds the percentage to a whole number', () => {
    const progress = routeProgress([
      trainee({ status: 'locked', ownSubmittedCount: 2, reportSent: true }),
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
    draftProgress: 'none' as const,
    reportSent: false,
  };

  // THE RULE, in one test. Assessed means the report has gone — nothing else.
  it('counts a trainee as assessed only once the report has been sent', () => {
    expect(traineeCategory({ ...base, ownSubmittedCount: 2, reportSent: true })).toBe('assessed');
  });

  // The defect reported from the field on 2026-09-07: a supervisor finished
  // both TP lessons, the marks went to the College, and the row jumped
  // straight to "✓ Assessed" with the report still unsent on the phone.
  it('calls a fully submitted assessment a draft while its report is unsent', () => {
    expect(traineeCategory({ ...base, status: 'partial', ownSubmittedCount: 2 })).toBe('drafted');
  });

  it('calls a locked result a draft while its report is unsent', () => {
    expect(traineeCategory({ ...base, status: 'locked', ownSubmittedCount: 2 })).toBe('drafted');
  });

  // The state describes the work, not the gesture: a trainee becomes a draft
  // on the last criterion accounted for, whether or not anything was pressed.
  it('counts a fully scored, unsent assessment as drafted', () => {
    expect(traineeCategory({ ...base, draftProgress: 'complete' })).toBe('drafted');
  });

  it('reaches drafted by either road — submitted marks or a complete local draft', () => {
    expect(traineeCategory({ ...base, ownSubmittedCount: 2, requiredCount: 2 })).toBe('drafted');
    expect(traineeCategory({ ...base, draftProgress: 'complete' })).toBe('drafted');
  });

  it('never calls a trainee with no instruments drafted', () => {
    // requiredCount 0 happens mid-sync, before the instruments land. `>=`
    // alone would satisfy it and file an unassessable trainee as finished.
    expect(traineeCategory({ ...base, ownSubmittedCount: 0, requiredCount: 0 })).toBe(
      'not-started',
    );
  });

  it('counts a part-scored draft as in progress', () => {
    expect(traineeCategory({ ...base, draftProgress: 'partial' })).toBe('in-progress');
  });

  it('counts a part-submitted track as in progress', () => {
    expect(traineeCategory({ ...base, ownSubmittedCount: 1 })).toBe('in-progress');
  });

  // Finished work outranks the half-submitted track it completes: the pair is
  // ready to send, which is what "draft" means here.
  it('prefers drafted over in progress when the remaining lesson is finished', () => {
    expect(traineeCategory({ ...base, ownSubmittedCount: 1, draftProgress: 'complete' })).toBe(
      'drafted',
    );
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
      {
        status: 'locked' as const,
        ownSubmittedCount: 2,
        requiredCount: 2,
        draftProgress: 'none' as const,
        reportSent: true,
      },
      {
        // Marks all in, report not sent — a draft, not an assessed trainee.
        status: 'partial' as const,
        ownSubmittedCount: 2,
        requiredCount: 2,
        draftProgress: 'none' as const,
        reportSent: false,
      },
      {
        status: 'pending' as const,
        ownSubmittedCount: 1,
        requiredCount: 2,
        draftProgress: 'none' as const,
        reportSent: false,
      },
      {
        status: 'pending' as const,
        ownSubmittedCount: 0,
        requiredCount: 1,
        draftProgress: 'complete' as const,
        reportSent: false,
      },
      {
        status: 'pending' as const,
        ownSubmittedCount: 0,
        requiredCount: 2,
        draftProgress: 'partial' as const,
        reportSent: false,
      },
      {
        status: 'pending' as const,
        ownSubmittedCount: 0,
        requiredCount: 2,
        draftProgress: 'none' as const,
        reportSent: false,
      },
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
