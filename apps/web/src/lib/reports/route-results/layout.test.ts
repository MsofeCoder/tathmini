import { describe, expect, it } from 'vitest';
import {
  assessorPct,
  assessorTotal,
  COLUMNS,
  NO_MARKS,
  routeSheet,
  TRACK_MAX,
  type RouteResultRow,
} from './layout';

function tpRow(overrides: Partial<RouteResultRow> = {}): RouteResultRow {
  return {
    name: 'ABAS JAMAL MGOVANO',
    registrationNumber: 'MVTTC/CAVT/2025/0357',
    occupation: 'Motor Vehicle Mechanics',
    institution: 'IRINGA RVTSC',
    district: 'IRINGA',
    region: 'IRINGA',
    a1: { theory: 31, practical: 31.5, single: null, assessedOn: null, name: 'Nehemia David' },
    a2: { theory: 34.5, practical: 35.5, single: null, assessedOn: null, name: null },
    theoryTotal: 32.75,
    practicalTotal: 33.5,
    total: 66.3,
    pct: 66.3,
    grade: 'B',
    competent: true,
    ...overrides,
  };
}

function iptRow(overrides: Partial<RouteResultRow> = {}): RouteResultRow {
  return {
    name: 'Adeni Mwanitu',
    registrationNumber: null,
    occupation: 'MEC',
    institution: 'Zone AUTO',
    district: 'Dodoma',
    region: 'DODOMA',
    a1: {
      theory: null,
      practical: null,
      single: 58,
      assessedOn: '2026-09-08',
      name: 'Aron Franco',
    },
    a2: { theory: null, practical: null, single: 55, assessedOn: '2026-09-08', name: null },
    theoryTotal: null,
    practicalTotal: null,
    total: 56.5,
    pct: 80.71,
    grade: 'A',
    competent: true,
    ...overrides,
  };
}

function headers(track: 'TP' | 'IPT'): string[] {
  return COLUMNS[track].map((c) => c.header);
}

/** The printed row, or a failure — an absent row is never a passing test. */
function printed(model: ReturnType<typeof routeSheet>, row = 0): (string | number | null)[] {
  const values = model.rows[row];
  if (!values) throw new Error(`no row ${row} in sheet ${model.name}`);
  return values;
}

function cells(model: ReturnType<typeof routeSheet>, header: string, row = 0) {
  const index = model.columns.findIndex((c) => c.header === header);
  return printed(model, row)[index];
}

describe('assessorTotal', () => {
  it('sums the two TP instruments — the assessor page TOTAL MARKS', () => {
    expect(assessorTotal(tpRow().a1)).toBe(62.5);
  });

  it('takes the single IPT mark as it stands', () => {
    expect(assessorTotal(iptRow().a1)).toBe(58);
  });

  it('is null when an assessor has not submitted', () => {
    expect(assessorTotal(NO_MARKS)).toBeNull();
  });

  it('is null when only one TP instrument is in', () => {
    expect(assessorTotal({ ...NO_MARKS, theory: 31 })).toBeNull();
  });
});

describe('assessorPct', () => {
  it('reads an IPT total against 70, not against 100', () => {
    expect(assessorPct(iptRow().a1, TRACK_MAX.IPT)).toBe(82.86);
  });

  it('is null with no marks', () => {
    expect(assessorPct(NO_MARKS, TRACK_MAX.IPT)).toBeNull();
  });
});

describe('the two layouts', () => {
  it('gives TP one total/percent column per block, because they are one number', () => {
    expect(headers('TP').filter((h) => h === 'TOTAL/100 %')).toHaveLength(3);
    expect(headers('TP')).not.toContain('%');
  });

  it('gives IPT a separate % column, because 57.5 of 70 is not 57.5%', () => {
    expect(headers('IPT').filter((h) => h === 'TOTAL /70')).toHaveLength(3);
    expect(headers('IPT').filter((h) => h === '%')).toHaveLength(3);
  });

  it('keeps each register its own word for the same field', () => {
    expect(headers('TP')).toContain('OCCUPATION');
    expect(headers('TP')).toContain('INSTITUTION');
    expect(headers('IPT')).toContain('TRADE');
    expect(headers('IPT')).toContain('COMPANY / INSTITUTION');
  });

  it('splits TP into theory and practical, and does not pretend IPT has them', () => {
    expect(headers('TP').filter((h) => h === 'Theory /50')).toHaveLength(3);
    expect(headers('IPT')).not.toContain('Theory /50');
  });
});

describe('routeSheet', () => {
  it('lays a TP row out under the right headers', () => {
    const model = routeSheet({
      routeCode: 'TP ROUTE 5',
      routeLabel: null,
      track: 'TP',
      rows: [tpRow()],
    });

    expect(cells(model, 'NAME OF TRAINEE')).toBe('ABAS JAMAL MGOVANO');
    expect(cells(model, 'TOTAL/100 %')).toBe(62.5); // assessor 1's own total
    expect(printed(model).at(-2)).toBe('B');
    expect(printed(model).at(-1)).toBe('COMPETENT');
  });

  it('carries the stored total and percentage for IPT rather than deriving one', () => {
    const model = routeSheet({
      routeCode: 'IPT ROUTE 2',
      routeLabel: 'MORO/DODOMA/KILIMANJARO',
      track: 'IPT',
      rows: [iptRow()],
    });

    const totals = model.columns
      .map((c, i) => ({ header: c.header, value: printed(model)[i], band: c.band }))
      .filter((c) => c.band === 'avg');

    expect(totals.find((c) => c.header === 'TOTAL /70')?.value).toBe(56.5);
    expect(totals.find((c) => c.header === '%')?.value).toBe(80.71);
  });

  it('names the sheet after the route and puts the label in the subtitle', () => {
    const model = routeSheet({
      routeCode: 'IPT ROUTE 2',
      routeLabel: 'MORO/DODOMA/KILIMANJARO',
      track: 'IPT',
      rows: [iptRow()],
    });

    expect(model.name).toBe('IPT ROUTE 2');
    expect(model.subtitle).toContain('INDUSTRIAL PRACTICAL TRAINING (IPT)');
    expect(model.subtitle).toContain('MORO/DODOMA/KILIMANJARO');
  });

  it('names an assessor when RLS let the name through, and does not invent one when it did not', () => {
    const model = routeSheet({
      routeCode: 'TP ROUTE 5',
      routeLabel: null,
      track: 'TP',
      rows: [tpRow()],
    });

    expect(model.bands.find((b) => b.band === 'a1')?.label).toBe('ASSESSOR 1 - Nehemia David');
    // The colleague's users row is unreadable to a supervisor; no name, and
    // no placeholder pretending to be one.
    expect(model.bands.find((b) => b.band === 'a2')?.label).toBe('ASSESSOR 2');
  });

  it('spans each band across exactly its own columns', () => {
    const model = routeSheet({
      routeCode: 'TP ROUTE 5',
      routeLabel: null,
      track: 'TP',
      rows: [tpRow()],
    });

    const a1 = model.bands.find((b) => b.band === 'a1');
    expect(a1).toEqual({ band: 'a1', label: 'ASSESSOR 1 - Nehemia David', from: 8, to: 11 });
    expect(model.bands.find((b) => b.band === 'avg')).toMatchObject({ from: 16, to: 20 });
  });

  it('marks an unassessed trainee as pending and leaves their marks empty', () => {
    const pending = tpRow({
      name: 'ERICK CHARLES MASWI',
      a1: NO_MARKS,
      a2: NO_MARKS,
      theoryTotal: null,
      practicalTotal: null,
      total: null,
      pct: null,
      grade: null,
      competent: null,
    });

    const model = routeSheet({
      routeCode: 'TP ROUTE 5',
      routeLabel: null,
      track: 'TP',
      rows: [pending],
    });

    expect(model.pendingRows.has(0)).toBe(true);
    expect(printed(model).at(-1)).toBe('NOT YET ASSESSED');
    expect(cells(model, 'Theory /50')).toBeNull();
  });

  it('sorts by name regardless of the case the register used', () => {
    const model = routeSheet({
      routeCode: 'IPT ROUTE 2',
      routeLabel: null,
      track: 'IPT',
      rows: [
        iptRow({ name: 'ZAKARIA MWENDA' }),
        iptRow({ name: 'adeni Mwanitu' }),
        iptRow({ name: 'BARAKA LUCAS' }),
      ],
    });

    expect(model.rows.map((r) => r[1])).toEqual([
      'adeni Mwanitu',
      'BARAKA LUCAS',
      'ZAKARIA MWENDA',
    ]);
  });

  it('tells the reader why an assessor block can be blank', () => {
    const model = routeSheet({
      routeCode: 'TP ROUTE 5',
      routeLabel: null,
      track: 'TP',
      rows: [tpRow()],
    });

    expect(model.note).toMatch(/has not submitted yet/i);
  });

  it('numbers the rows from one, in the order they are printed', () => {
    const model = routeSheet({
      routeCode: 'TP ROUTE 5',
      routeLabel: null,
      track: 'TP',
      rows: [tpRow({ name: 'B TRAINEE' }), tpRow({ name: 'A TRAINEE' })],
    });

    expect(model.rows.map((r) => r[0])).toEqual([1, 2]);
    expect(model.rows.map((r) => r[1])).toEqual(['A TRAINEE', 'B TRAINEE']);
  });
});
