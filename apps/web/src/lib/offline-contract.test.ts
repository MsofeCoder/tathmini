import { describe, expect, it } from 'vitest';
import type { OfflineTrainee } from './db';
import { routeProgress, statusMeta, traineeParticulars } from './trainees';

/**
 * The offline screens are only as complete as the snapshot behind them: a
 * field trimmed from OfflineTrainee does not fail the build, it silently
 * blanks a row of the trainee's particulars in the one place a supervisor
 * cannot recover it — in a village with no signal.
 *
 * These tests pin the contract between the cached shape and the helpers the
 * offline route list and profile feed it, so a change to either side has to be
 * deliberate. They deliberately use the real helpers the ONLINE screens use;
 * that shared use is what keeps the two modes from drifting.
 */

function cached(overrides: Partial<OfflineTrainee> = {}): OfflineTrainee {
  return {
    id: 't1',
    name: 'Asha Mwakalinga',
    occupation: 'Electrical Installation',
    institution: 'Morogoro VTC',
    track: 'TP',
    status: 'pending',
    slot: 'a1',
    submittedInstrumentIds: [],
    registrationNumber: 'MVTTC/TP/2026/0142',
    course: 'TC-TVTE',
    modeOfStudy: 'Full Time',
    region: 'Morogoro',
    district: 'Morogoro Municipal',
    email: 'asha@example.test',
    phone: null,
    ownSubmittedCount: 0,
    requiredCount: 2,
    ...overrides,
  };
}

describe('offline snapshot drives the same screens as online', () => {
  it('carries every particular the profile prints — no blank rows offline', () => {
    const t = cached();
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
    // A missing cached field shows up as the em dash placeholder.
    expect(rows.filter((r) => r.value === '—')).toHaveLength(0);
    expect(rows.map((r) => r.value)).toContain('MVTTC/TP/2026/0142');
    expect(rows.map((r) => r.value)).toContain('Morogoro · Morogoro Municipal');
  });

  it('gives an IPT trainee a phone row rather than an empty email row', () => {
    const rows = traineeParticulars({
      ...cached({ track: 'IPT', email: null, phone: '0700000004' }),
      assessedByLabel: 'Denis Michael',
    });
    expect(rows.find((r) => r.label === 'Phone')?.value).toBe('0700000004');
    expect(rows.find((r) => r.label === 'Email')).toBeUndefined();
  });

  it('counts the route exactly as the online tiles do', () => {
    // Same inputs the online page derives server-side; the offline snapshot
    // has to carry ownSubmittedCount/requiredCount for this to agree, because
    // deriveStatus() collapses a part-finished TP trainee to 'pending'.
    const trainees = [
      cached({ id: 'a', status: 'locked' }),
      cached({ id: 'b', status: 'partial' }),
      cached({ id: 'c', status: 'pending', ownSubmittedCount: 1, requiredCount: 2 }),
      cached({ id: 'd', status: 'pending' }),
    ];

    const progress = routeProgress(
      trainees.map((t) => ({
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

  it('renders the same status badge offline as online', () => {
    expect(statusMeta(cached({ status: 'partial' }).status).short).toBe('◑ 1 of 2 assessors');
    expect(statusMeta(cached({ status: 'locked' }).status).short).toBe('✓ Assessed');
  });
});
