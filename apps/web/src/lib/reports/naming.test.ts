import { describe, expect, it } from 'vitest';
import { reportFileNames, slug } from './naming';

const NOW = new Date('2026-09-07T08:30:00Z');
const HASH = 'abcdef0123456789'.repeat(4);
const TRAINEE_ID = '11111111-2222-3333-4444-555555555555';

function names(overrides: Partial<Parameters<typeof reportFileNames>[0]> = {}) {
  return reportFileNames({
    traineeId: TRAINEE_ID,
    slot: 'a1',
    trainee: { name: 'Asha Mwakalinga', registrationNumber: 'MVTTC/TP/2026/0142', track: 'TP' },
    routeCode: 'TP ROUTE 3',
    resultId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    hash: HASH,
    now: NOW,
    ...overrides,
  });
}

describe('slug', () => {
  it('strips accents and punctuation rather than escaping them', () => {
    expect(slug('Mwakalinga, Asha-Júlia')).toBe('MWAKALINGA-ASHA-JULIA');
    expect(slug('MVTTC/TP/2026/0142')).toBe('MVTTC-TP-2026-0142');
  });

  it('never leaves leading or trailing separators', () => {
    expect(slug('  /weird/  ')).toBe('WEIRD');
  });
});

describe('reportFileNames', () => {
  it('keeps the trainee id as the second path segment, under the route', () => {
    // Migration 0016's Storage policies read the trainee id from this
    // position — reordering these two segments makes every object unreadable.
    const { storagePath } = names();
    expect(storagePath.split('/')[1]).toBe(TRAINEE_ID);
  });

  it('groups by route as the first path segment', () => {
    expect(names().storagePath.split('/')[0]).toBe('TP-ROUTE-3');
  });

  it('falls back to UNASSIGNED rather than emitting an empty first segment', () => {
    // trainees.route_id is NOT NULL so this cannot happen through the app, but
    // an empty segment would shift every later one up and break migration
    // 0016's positional read of the trainee id.
    const { storagePath } = names({
      routeCode: null,
    });
    expect(storagePath.split('/')[0]).toBe('UNASSIGNED');
    expect(storagePath.split('/')[1]).toBe(TRAINEE_ID);
  });

  it('files reports under a year folder', () => {
    expect(names().storagePath.split('/')[2]).toBe('2026');
  });

  it('names the object by track, assessor, registration, date and hash', () => {
    expect(names().storagePath).toBe(
      `TP-ROUTE-3/${TRAINEE_ID}/2026/TP-ASSESSOR1-MVTTC-TP-2026-0142-20260907-abcdef01.pdf`,
    );
  });

  it('distinguishes the two assessors', () => {
    expect(names({ slot: 'a2' }).storagePath).toContain('ASSESSOR2');
    expect(names({ slot: 'a2' }).downloadName).toContain('Assessor2');
  });

  it('keeps the trainee name out of the storage key but in the download name', () => {
    // Bucket listings are visible to coordinators and super_admins and show up
    // in tooling; the name only belongs where someone is already authorised.
    const { storagePath, downloadName } = names();
    expect(storagePath).not.toContain('ASHA');
    expect(downloadName).toContain('ASHA-MWAKALINGA');
  });

  it('falls back to the result id when there is no registration number', () => {
    // IPT trainees have no registration number — the register records a phone.
    const { storagePath } = names({
      trainee: { name: 'Juma Ally', registrationNumber: null, track: 'IPT' },
      routeCode: 'IPT ROUTE 1',
    });
    expect(storagePath).toContain('IPT-ASSESSOR1-REF-AAAAAAAA-');
  });

  it('gives identical content an identical key, so a double tap collides harmlessly', () => {
    expect(names().storagePath).toBe(names().storagePath);
  });

  it('gives different content a different key, so regeneration never overwrites', () => {
    const other = names({ hash: '9999999999999999'.repeat(4) });
    expect(other.storagePath).not.toBe(names().storagePath);
  });

  it('produces a download name a supervisor can read at a glance', () => {
    expect(names().downloadName).toBe(
      'MVTTC-TP-Result-ASHA-MWAKALINGA-MVTTC-TP-2026-0142-Assessor1-2026-09-07.pdf',
    );
  });
});
