import { describe, expect, it } from 'vitest';
import type { DeviceRows } from './derive';
import { buildMarking, buildProfile, buildRouteRows } from './derive';

/**
 * The numbers a supervisor reads off a phone and acts on.
 *
 * These rules used to live inside server components, where nothing could
 * test them. They were lifted out unaltered when the screens moved onto the
 * device — same derivation, same counters — so this file is the first time
 * any of it has been asserted.
 */

const INSTRUMENTS = [
  { id: 'i-theory', code: 'tp_theory', label: 'Theory', track: 'TP' as const, maxTotal: 50 },
  {
    id: 'i-practical',
    code: 'tp_practical',
    label: 'Practical Lesson',
    track: 'TP' as const,
    maxTotal: 50,
  },
  { id: 'i-ipt', code: 'ipt', label: 'IPT Assessment', track: 'IPT' as const, maxTotal: 70 },
];

function trainee(id: string, name: string, track: 'TP' | 'IPT' = 'TP') {
  return {
    id,
    name,
    occupation: 'Carpentry',
    institution: 'Morogoro VTC',
    track,
    routeId: 'r1',
    registrationNumber: `REG-${id}`,
    course: 'TC-TVTE',
    modeOfStudy: 'Full time',
    region: 'Morogoro',
    district: 'Morogoro Urban',
    email: null,
    phone: null,
  };
}

function rows(overrides: Partial<DeviceRows> = {}): DeviceRows {
  return {
    trainees: [],
    assignments: [],
    instruments: INSTRUMENTS,
    criteria: [],
    marks: [],
    results: [],
    reports: [],
    session: {
      key: 'session',
      userId: 'u1',
      name: 'J. Mwakalinga',
      role: 'supervisor',
      mustChangePassword: false,
      routeCode: 'TP ROUTE 6',
      routeLabel: null,
      syncedAt: 0,
    },
    ...overrides,
  };
}

describe('buildRouteRows', () => {
  it('counts only SUBMITTED marks — a started, unfinalized row is not progress', () => {
    const result = buildRouteRows(
      rows({
        trainees: [trainee('t1', 'AMINA JUMA')],
        marks: [
          { key: 't1:i-theory', traineeId: 't1', instrumentId: 'i-theory', submittedAt: 'now' },
          {
            key: 't1:i-practical',
            traineeId: 't1',
            instrumentId: 'i-practical',
            submittedAt: null,
          },
        ],
      }),
    );
    expect(result[0]).toMatchObject({ ownSubmittedCount: 1, requiredCount: 2, status: 'pending' });
  });

  it('marks a TP trainee partial only once BOTH instruments are in', () => {
    const result = buildRouteRows(
      rows({
        trainees: [trainee('t1', 'AMINA JUMA')],
        marks: [
          { key: 't1:i-theory', traineeId: 't1', instrumentId: 'i-theory', submittedAt: 'now' },
          {
            key: 't1:i-practical',
            traineeId: 't1',
            instrumentId: 'i-practical',
            submittedAt: 'now',
          },
        ],
      }),
    );
    expect(result[0]!.status).toBe('partial');
  });

  it('an IPT trainee needs one instrument, not two', () => {
    const result = buildRouteRows(
      rows({
        trainees: [trainee('t9', 'RASHID OMARI', 'IPT')],
        marks: [{ key: 't9:i-ipt', traineeId: 't9', instrumentId: 'i-ipt', submittedAt: 'now' }],
      }),
    );
    expect(result[0]).toMatchObject({ requiredCount: 1, status: 'partial' });
  });

  it('locked beats everything — both assessors are in', () => {
    const result = buildRouteRows(
      rows({
        trainees: [trainee('t1', 'AMINA JUMA')],
        results: [{ traineeId: 't1', lockedAt: '2026-09-06T08:00:00Z' }],
      }),
    );
    expect(result[0]!.status).toBe('locked');
  });

  // IndexedDB returns rows in primary-key order, and the primary key is a
  // random uuid — so without this a supervisor's route would reshuffle itself
  // on every sync.
  it('sorts by name, so the route does not reorder underneath the supervisor', () => {
    const result = buildRouteRows(
      rows({
        trainees: [
          trainee('t3', 'ZAINABU HASSANI'),
          trainee('t1', 'AMINA JUMA'),
          trainee('t2', 'MUSSA BAKARI'),
        ],
      }),
    );
    expect(result.map((r) => r.name)).toEqual(['AMINA JUMA', 'MUSSA BAKARI', 'ZAINABU HASSANI']);
  });
});

describe('buildProfile', () => {
  it('returns null for a trainee this phone does not hold', () => {
    expect(buildProfile(rows(), 'nobody')).toBeNull();
  });

  it('offers only the instruments of the trainee’s own track', () => {
    const view = buildProfile(
      rows({
        trainees: [trainee('t9', 'RASHID OMARI', 'IPT')],
        assignments: [{ traineeId: 't9', slot: 'a1' }],
      }),
      't9',
    )!;
    expect(view.actions.map((a) => a.code)).toEqual(['ipt']);
  });

  it('names the assessor slot, as the printed report heading needs', () => {
    const view = buildProfile(
      rows({
        trainees: [trainee('t1', 'AMINA JUMA')],
        assignments: [{ traineeId: 't1', slot: 'a2' }],
      }),
      't1',
    )!;
    expect(view.assessedByLabel).toBe('J. Mwakalinga (Assessor 2 of 2)');
  });

  it('will not offer marking to a supervisor with no slot on this trainee', () => {
    const view = buildProfile(rows({ trainees: [trainee('t1', 'AMINA JUMA')] }), 't1')!;
    expect(view.canAssess).toBe(false);
  });

  it('will not offer marking once the record is locked', () => {
    const view = buildProfile(
      rows({
        trainees: [trainee('t1', 'AMINA JUMA')],
        assignments: [{ traineeId: 't1', slot: 'a1' }],
        results: [{ traineeId: 't1', lockedAt: 'yes' }],
      }),
      't1',
    )!;
    expect(view.canAssess).toBe(false);
  });

  // This, not `locked`, is what makes a report available — so an absent
  // second assessor never blocks a supervisor from sending their own.
  it('own slot is complete when this assessor has submitted every instrument', () => {
    const view = buildProfile(
      rows({
        trainees: [trainee('t1', 'AMINA JUMA')],
        assignments: [{ traineeId: 't1', slot: 'a1' }],
        marks: [
          { key: 't1:i-theory', traineeId: 't1', instrumentId: 'i-theory', submittedAt: 'now' },
          {
            key: 't1:i-practical',
            traineeId: 't1',
            instrumentId: 'i-practical',
            submittedAt: 'now',
          },
        ],
      }),
      't1',
    )!;
    expect(view.ownSlotComplete).toBe(true);
    expect(view.locked).toBe(false);
  });

  it('is not complete with only half of a TP track submitted', () => {
    const view = buildProfile(
      rows({
        trainees: [trainee('t1', 'AMINA JUMA')],
        assignments: [{ traineeId: 't1', slot: 'a1' }],
        marks: [
          { key: 't1:i-theory', traineeId: 't1', instrumentId: 'i-theory', submittedAt: 'now' },
        ],
      }),
      't1',
    )!;
    expect(view.ownSlotComplete).toBe(false);
  });

  // The send button's own state dies on a reload; this is what stops a
  // supervisor being offered it a second time and posting a trainee a second
  // copy of their result.
  it('surfaces a report this assessor already sent', () => {
    const view = buildProfile(
      rows({
        trainees: [trainee('t1', 'AMINA JUMA')],
        reports: [{ traineeId: 't1', generatedAt: '2026-09-06T09:00:00Z' }],
      }),
      't1',
    )!;
    expect(view.alreadySentAt).toBe('2026-09-06T09:00:00Z');
  });
});

describe('buildMarking', () => {
  const criteria = [
    {
      id: 'c2',
      instrumentId: 'i-theory',
      sectionCode: 'B',
      sectionLabel: 'Presentation',
      sectionMax: 30,
      itemCode: 'i',
      itemLabel: 'Introduces the lesson',
      itemMax: 5,
      orderIndex: 2,
    },
    {
      id: 'c1',
      instrumentId: 'i-theory',
      sectionCode: 'A',
      sectionLabel: 'Preparation',
      sectionMax: 20,
      itemCode: 'i',
      itemLabel: 'Scheme of work',
      itemMax: 5,
      orderIndex: 1,
    },
  ];

  const marking = (overrides: Partial<DeviceRows> = {}) =>
    rows({
      trainees: [trainee('t1', 'AMINA JUMA')],
      assignments: [{ traineeId: 't1', slot: 'a1' }],
      criteria,
      ...overrides,
    });

  it('returns the instrument’s criteria in form order', () => {
    const view = buildMarking(marking(), 't1', 'tp_theory')!;
    expect(view.criteria.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(view.slot).toBe('a1');
  });

  it('refuses an instrument from the other track', () => {
    expect(buildMarking(marking(), 't1', 'ipt')).toBeNull();
  });

  it('refuses a trainee this supervisor holds no slot for', () => {
    expect(buildMarking(marking({ assignments: [] }), 't1', 'tp_theory')).toBeNull();
  });

  // A form with no criteria would let a supervisor "complete" an empty
  // assessment — the gate counts what it was given, and it was given nothing.
  it('refuses a form whose criteria have not reached this phone', () => {
    expect(buildMarking(marking({ criteria: [] }), 't1', 'tp_theory')).toBeNull();
  });

  it('reports an instrument already submitted, so it is not marked twice', () => {
    const view = buildMarking(
      marking({
        marks: [
          { key: 't1:i-theory', traineeId: 't1', instrumentId: 'i-theory', submittedAt: 'now' },
        ],
      }),
      't1',
      'tp_theory',
    )!;
    expect(view.alreadySubmitted).toBe(true);
  });
});
