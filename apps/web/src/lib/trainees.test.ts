import { describe, expect, it } from 'vitest';
import {
  deriveStatus,
  initials,
  statusMeta,
  statusPlain,
  trackChipStyle,
  traineeParticulars,
  trackPointsLabel,
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
