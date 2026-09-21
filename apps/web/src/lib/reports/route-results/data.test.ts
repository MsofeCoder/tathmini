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

/** A row as `route_results_marks()` returns it. */
function mark(over: Partial<Parameters<typeof pivotRows>[1][number]> = {}) {
  return {
    trainee_id: 't1',
    slot: 'a1' as const,
    instrument_code: 'tp_theory',
    total: 31 as string | number | null,
    assessed_on: null as string | null,
    submitted_on: null as string | null,
    supervisor_name: null as string | null,
    ...over,
  };
}

describe('pivotRows', () => {
  it('puts each TP instrument in its own slot', () => {
    const row = only(
      pivotRows(
        [TP_TRAINEE],
        [
          mark({ instrument_code: 'tp_theory', total: '31.00', supervisor_name: 'Nehemia David' }),
          mark({
            instrument_code: 'tp_practical',
            total: '31.50',
            supervisor_name: 'Nehemia David',
          }),
        ],
        [],
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
          mark({
            trainee_id: 't2',
            slot: 'a2',
            instrument_code: 'ipt',
            total: 55,
            assessed_on: '2026-09-08',
          }),
        ],
        [],
      ),
    );

    expect(row.a2.single).toBe(55);
    expect(row.a2.theory).toBeNull();
    expect(row.a2.practical).toBeNull();
    expect(row.a2.assessedOn).toBe('2026-09-08');
  });

  it('names the other assessor, which 0035 is what makes possible', () => {
    const row = only(
      pivotRows(
        [TP_TRAINEE],
        [
          mark({ supervisor_name: 'Nehemia David' }),
          mark({ slot: 'a2', supervisor_name: 'Laurent Mwaisanila' }),
        ],
        [],
      ),
    );

    expect(row.a1.name).toBe('Nehemia David');
    expect(row.a2.name).toBe('Laurent Mwaisanila');
  });

  it('falls back to the submission date when the assessment date was never filled in', () => {
    const row = only(
      pivotRows([TP_TRAINEE], [mark({ assessed_on: null, submitted_on: '2026-09-07' })], []),
    );

    expect(row.a1.assessedOn).toBe('2026-09-07');
  });

  it('prefers the assessment date over the submission date when both exist', () => {
    // The whole point of migration 0034: marked in a workshop on Monday,
    // submitted on Wednesday when the supervisor next had signal.
    const row = only(
      pivotRows(
        [TP_TRAINEE],
        [mark({ assessed_on: '2026-09-14', submitted_on: '2026-09-16' })],
        [],
      ),
    );

    expect(row.a1.assessedOn).toBe('2026-09-14');
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
      ),
    );

    expect(row.theoryTotal).toBe(32.75);
    expect(row.total).toBe(66.3);
    expect(row.grade).toBe('B');
    expect(row.competent).toBe(true);
  });

  it('carries a null locked_at through, because that is what makes a row provisional', () => {
    const row = only(
      pivotRows(
        [IPT_TRAINEE],
        [],
        [
          {
            trainee_id: 't2',
            theory_total: null,
            practical_total: null,
            total: '59.00',
            pct: '84.29',
            grade: 'A',
            competent: true,
          },
        ],
      ),
    );

    expect(row.total).toBe(59);
  });

  it('leaves a trainee with no result row wholly unassessed', () => {
    const row = only(pivotRows([TP_TRAINEE], [], []));

    expect(row.total).toBeNull();
    expect(row.grade).toBeNull();
    expect(row.competent).toBeNull();
    expect(row.a1.theory).toBeNull();
  });

  it('takes the earliest date when an assessor dated their two instruments differently', () => {
    const row = only(
      pivotRows(
        [TP_TRAINEE],
        [
          mark({ instrument_code: 'tp_theory', assessed_on: '2026-09-16' }),
          mark({ instrument_code: 'tp_practical', assessed_on: '2026-09-15' }),
        ],
        [],
      ),
    );

    expect(row.a1.assessedOn).toBe('2026-09-15');
  });

  it('keeps one trainee’s marks off another', () => {
    const rows = pivotRows(
      [TP_TRAINEE, { ...TP_TRAINEE, id: 't9', name: 'SOMEBODY ELSE' }],
      [mark()],
      [],
    );

    expect(at(rows, 0).a1.theory).toBe(31);
    expect(at(rows, 1).a1.theory).toBeNull();
  });
});
