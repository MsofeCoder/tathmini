import { describe, expect, it } from 'vitest';
import { pivotRows } from './data';
import type { RouteResultRow } from './layout';

/** pivotRows keeps one row per trainee; an empty result is a failure, not a skip. */
function only(rows: RouteResultRow[]): RouteResultRow {
  const [row] = rows;
  if (!row) throw new Error('pivotRows returned no rows');
  return row;
}

function at(rows: RouteResultRow[], index: number): RouteResultRow {
  const row = rows[index];
  if (!row) throw new Error(`pivotRows returned no row ${index}`);
  return row;
}

const INSTRUMENTS = new Map([
  ['i-theory', 'tp_theory'],
  ['i-practical', 'tp_practical'],
  ['i-ipt', 'ipt'],
]);

const TP_TRAINEE = {
  id: 't1',
  name: 'ABAS JAMAL MGOVANO',
  registration_number: 'MVTTC/CAVT/2025/0357',
  occupation: 'Motor Vehicle Mechanics',
  institution: 'IRINGA RVTSC',
  district: 'IRINGA',
  region: 'IRINGA',
  track: 'TP' as const,
  route_id: 'r1',
};

const IPT_TRAINEE = {
  id: 't2',
  name: 'Adeni Mwanitu',
  registration_number: null,
  occupation: 'MEC',
  institution: 'Zone AUTO',
  district: 'Dodoma',
  region: 'DODOMA',
  track: 'IPT' as const,
  route_id: 'r2',
};

describe('pivotRows', () => {
  it('puts each TP instrument in its own slot', () => {
    const row = only(
      pivotRows(
        [TP_TRAINEE],
        [
          {
            trainee_id: 't1',
            slot: 'a1',
            instrument_id: 'i-theory',
            total: '31.00',
            assessed_on: null,
            supervisor: { name: 'Nehemia David' },
          },
          {
            trainee_id: 't1',
            slot: 'a1',
            instrument_id: 'i-practical',
            total: '31.50',
            assessed_on: null,
            supervisor: { name: 'Nehemia David' },
          },
        ],
        [],
        INSTRUMENTS,
      ),
    );

    expect(row.a1.theory).toBe(31);
    expect(row.a1.practical).toBe(31.5);
    expect(row.a1.single).toBeNull();
    expect(row.a1.name).toBe('Nehemia David');
  });

  it('reads an IPT mark as the single total, with no theory or practical', () => {
    const row = only(
      pivotRows(
        [IPT_TRAINEE],
        [
          {
            trainee_id: 't2',
            slot: 'a2',
            instrument_id: 'i-ipt',
            total: 55,
            assessed_on: '2026-09-08',
            supervisor: null,
          },
        ],
        [],
        INSTRUMENTS,
      ),
    );

    expect(row.a2.single).toBe(55);
    expect(row.a2.theory).toBeNull();
    expect(row.a2.practical).toBeNull();
    expect(row.a2.assessedOn).toBe('2026-09-08');
  });

  it('leaves a slot empty when RLS withheld it, rather than borrowing the other', () => {
    const row = only(
      pivotRows(
        [TP_TRAINEE],
        [
          {
            trainee_id: 't1',
            slot: 'a1',
            instrument_id: 'i-theory',
            total: 31,
            assessed_on: null,
            supervisor: { name: 'Nehemia David' },
          },
        ],
        [],
        INSTRUMENTS,
      ),
    );

    expect(row.a1.theory).toBe(31);
    expect(row.a2.theory).toBeNull();
    expect(row.a2.name).toBeNull();
  });

  it('takes the stored result verbatim, numerics parsed but never recomputed', () => {
    const row = only(
      pivotRows(
        [TP_TRAINEE],
        [],
        [
          {
            trainee_id: 't1',
            theory_total: '32.75',
            practical_total: '33.50',
            total: '66.30',
            pct: '66.30',
            grade: 'B',
            competent: true,
          },
        ],
        INSTRUMENTS,
      ),
    );

    expect(row.theoryTotal).toBe(32.75);
    expect(row.total).toBe(66.3);
    expect(row.grade).toBe('B');
    expect(row.competent).toBe(true);
  });

  it('leaves a trainee with no result row wholly unassessed', () => {
    const row = only(pivotRows([TP_TRAINEE], [], [], INSTRUMENTS));

    expect(row.total).toBeNull();
    expect(row.grade).toBeNull();
    expect(row.competent).toBeNull();
    expect(row.a1.theory).toBeNull();
  });

  it('accepts the embedded supervisor as an array, which PostgREST may return', () => {
    const row = only(
      pivotRows(
        [TP_TRAINEE],
        [
          {
            trainee_id: 't1',
            slot: 'a1',
            instrument_id: 'i-theory',
            total: 31,
            assessed_on: null,
            supervisor: [{ name: 'Nehemia David' }],
          },
        ],
        [],
        INSTRUMENTS,
      ),
    );

    expect(row.a1.name).toBe('Nehemia David');
  });

  it('takes the earliest date when an assessor dated their two instruments differently', () => {
    const row = only(
      pivotRows(
        [TP_TRAINEE],
        [
          {
            trainee_id: 't1',
            slot: 'a1',
            instrument_id: 'i-theory',
            total: 31,
            assessed_on: '2026-09-16',
            supervisor: null,
          },
          {
            trainee_id: 't1',
            slot: 'a1',
            instrument_id: 'i-practical',
            total: 31.5,
            assessed_on: '2026-09-15',
            supervisor: null,
          },
        ],
        [],
        INSTRUMENTS,
      ),
    );

    expect(row.a1.assessedOn).toBe('2026-09-15');
  });

  it('keeps one trainee’s marks off another', () => {
    const rows = pivotRows(
      [TP_TRAINEE, { ...TP_TRAINEE, id: 't9', name: 'SOMEBODY ELSE' }],
      [
        {
          trainee_id: 't1',
          slot: 'a1',
          instrument_id: 'i-theory',
          total: 31,
          assessed_on: null,
          supervisor: null,
        },
      ],
      [],
      INSTRUMENTS,
    );

    expect(at(rows, 0).a1.theory).toBe(31);
    expect(at(rows, 1).a1.theory).toBeNull();
  });
});
