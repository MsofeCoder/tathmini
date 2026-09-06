import { describe, expect, it } from 'vitest';
import type { LocalTrainee } from './db';
import { buildRouteRows, type DeviceRows } from './local/derive';
import { routeProgress, statusMeta, traineeParticulars } from './trainees';

/**
 * The screens are only as complete as the rows behind them: a field trimmed
 * from `LocalTrainee`, or dropped from the sync payload that fills it, does
 * not fail the build. It silently blanks a row of the trainee's particulars
 * in the one place a supervisor cannot recover it — in a village with no
 * signal, on the screen that exists so nothing has to be typed in the field.
 *
 * This used to pin the old one-blob route snapshot, back when there were two
 * sets of screens and the risk was that they drifted apart. There is one set
 * now, so the risk moved: the replica in IndexedDB IS what every screen
 * renders, online and off, and these tests pin the contract between it and
 * the helpers that read it.
 */

function stored(overrides: Partial<LocalTrainee> = {}): LocalTrainee {
  return {
    id: 't1',
    name: 'Asha Mwakalinga',
    occupation: 'Electrical Installation',
    institution: 'Morogoro VTC',
    track: 'TP',
    routeId: 'r1',
    registrationNumber: 'MVTTC/TP/2026/0142',
    course: 'TC-TVTE',
    modeOfStudy: 'Full Time',
    region: 'Morogoro',
    district: 'Morogoro Municipal',
    email: 'asha@example.test',
    phone: null,
    ...overrides,
  };
}

const INSTRUMENTS = [
  { id: 'i-theory', code: 'tp_theory', label: 'Theory', track: 'TP' as const, maxTotal: 50 },
  {
    id: 'i-practical',
    code: 'tp_practical',
    label: 'Practical Lesson',
    track: 'TP' as const,
    maxTotal: 50,
  },
];

function device(trainees: LocalTrainee[], overrides: Partial<DeviceRows> = {}): DeviceRows {
  return {
    trainees,
    assignments: [],
    instruments: INSTRUMENTS,
    criteria: [],
    marks: [],
    results: [],
    reports: [],
    session: null,
    ...overrides,
  };
}

describe('the device’s rows drive the screens completely', () => {
  it('carry every particular the profile prints — no blank rows offline', () => {
    const t = stored();
    const rows = traineeParticulars({
      track: t.track,
      registrationNumber: t.registrationNumber,
      occupation: t.occupation,
      course: t.course,
      modeOfStudy: t.modeOfStudy,
      institution: t.institution,
      region: t.region,
      district: t.district,
      email: t.email,
      phone: t.phone,
      assessedByLabel: 'Denis Michael',
    });

    expect(rows.length).toBeGreaterThan(0);
    // A missing stored field shows up as the em dash placeholder.
    expect(rows.filter((r) => r.value === '—')).toHaveLength(0);
    expect(rows.map((r) => r.value)).toContain('MVTTC/TP/2026/0142');
    expect(rows.map((r) => r.value)).toContain('Morogoro · Morogoro Municipal');
  });

  it('gives an IPT trainee a phone row rather than an empty email row', () => {
    const rows = traineeParticulars({
      ...stored({ track: 'IPT', email: null, phone: '0700000004' }),
      assessedByLabel: 'Denis Michael',
    });
    expect(rows.find((r) => r.label === 'Phone')?.value).toBe('0700000004');
    expect(rows.find((r) => r.label === 'Email')).toBeUndefined();
  });

  it('produce the same tile counts the server used to compute', () => {
    // Derived from raw rows now, not from counts carried alongside them, so
    // a Realtime change to a single mark cannot leave a stale tile behind.
    const rows = buildRouteRows(
      device(
        [
          stored({ id: 'a', name: 'A' }),
          stored({ id: 'b', name: 'B' }),
          stored({ id: 'c', name: 'C' }),
          stored({ id: 'd', name: 'D' }),
        ],
        {
          results: [{ traineeId: 'a', lockedAt: '2026-09-06T08:00:00Z' }],
          marks: [
            // b: both instruments in — this supervisor's half is done.
            { key: 'b:i-theory', traineeId: 'b', instrumentId: 'i-theory', submittedAt: 'now' },
            {
              key: 'b:i-practical',
              traineeId: 'b',
              instrumentId: 'i-practical',
              submittedAt: 'now',
            },
            // c: half done — deriveStatus() collapses this to 'pending', so
            // the raw counts are what tell it apart from untouched.
            { key: 'c:i-theory', traineeId: 'c', instrumentId: 'i-theory', submittedAt: 'now' },
          ],
        },
      ),
    );

    const progress = routeProgress(
      rows.map((t) => ({
        status: t.status,
        ownSubmittedCount: t.ownSubmittedCount,
        requiredCount: t.requiredCount,
        hasDraft: false,
      })),
    );

    expect(progress).toEqual({ assessed: 2, inProgress: 1, notStarted: 1, pct: 50 });
  });

  it('counts an unsent local draft as in progress, which only the device knows', () => {
    const progress = routeProgress([
      { status: 'pending', ownSubmittedCount: 0, requiredCount: 1, hasDraft: true },
    ]);
    expect(progress.inProgress).toBe(1);
    expect(progress.notStarted).toBe(0);
  });

  it('renders the prototype’s own status badges', () => {
    expect(statusMeta('partial').short).toBe('◑ 1 of 2 assessors');
    expect(statusMeta('locked').short).toBe('✓ Assessed');
  });
});
