import { describe, expect, it } from 'vitest';
import {
  EXPORT_TABLES,
  csvValue,
  exportFileStamp,
  manifestCsv,
  readme,
  toCsv,
} from './data-export';

describe('EXPORT_TABLES', () => {
  /**
   * The point of this list is that it is complete. A backup that quietly omits
   * a table is discovered to have omitted it at the worst possible moment, so
   * the tables that carry the assessment are named here explicitly rather than
   * trusted to a count.
   */
  it('carries every table that holds the assessment', () => {
    const names = EXPORT_TABLES.map((t) => t.table);
    for (const required of [
      'trainees',
      'assessment_marks',
      'assessment_mark_items',
      'results',
      'audit_log',
      'users',
      'routes',
      'assignments',
      'reports',
    ]) {
      expect(names).toContain(required);
    }
  });

  it('includes the instruments and criteria, without which the scores are opaque uuids', () => {
    const names = EXPORT_TABLES.map((t) => t.table);
    expect(names).toContain('instruments');
    expect(names).toContain('criteria');
  });

  it('names each table once, and explains each one', () => {
    const names = EXPORT_TABLES.map((t) => t.table);
    expect(new Set(names).size).toBe(names.length);
    expect(EXPORT_TABLES.every((t) => t.purpose.length > 0 && t.orderBy.length > 0)).toBe(true);
  });
});

describe('csvValue', () => {
  it('passes strings and numbers through', () => {
    expect(csvValue('EMMANUEL  MAKANTA')).toBe('EMMANUEL  MAKANTA');
    expect(csvValue(74.5)).toBe(74.5);
  });

  it('writes booleans as words a spreadsheet reads correctly', () => {
    expect(csvValue(true)).toBe('true');
    expect(csvValue(false)).toBe('false');
  });

  it('keeps null distinct from an empty string', () => {
    expect(csvValue(null)).toBeNull();
    expect(csvValue(undefined)).toBeNull();
    expect(csvValue('')).toBe('');
  });

  /** audit_log.before/after are jsonb, and they are the most valuable columns here. */
  it('emits jsonb as JSON rather than [object Object]', () => {
    expect(csvValue({ total: 74, grade: 'B' })).toBe('{"total":74,"grade":"B"}');
    expect(csvValue([1, 2])).toBe('[1,2]');
  });
});

describe('toCsv', () => {
  // Every field is quoted — csvField does that unconditionally, so a trainee
  // name containing a comma, or a cell starting `=`, cannot break the sheet.
  it('writes a header from the first row, then every row', () => {
    const csv = toCsv([
      { id: '1', name: 'Lymo', active: true },
      { id: '2', name: 'Denis Michael', active: false },
    ]);
    expect(csv).toBe(
      '"id","name","active"\r\n"1","Lymo","true"\r\n"2","Denis Michael","false"\r\n',
    );
  });

  /**
   * The failure that makes a CSV look fine and be wrong: a row with an extra
   * or missing key shifting every later value one column left. Columns are
   * fixed by the first row, so a later row can only be blank, never shifted.
   */
  it('reads every row through the first row’s columns', () => {
    const csv = toCsv([
      { id: '1', name: 'A' },
      { id: '2', name: 'B', surprise: 'ignored' },
      { id: '3' },
    ]);
    expect(csv).toBe('"id","name"\r\n"1","A"\r\n"2","B"\r\n"3",""\r\n');
  });

  it('gives an empty table an empty file rather than omitting it', () => {
    expect(toCsv([])).toBe('');
  });

  it('quotes a value carrying a comma, so the row does not gain a column', () => {
    expect(toCsv([{ note: 'Declined, address was right' }])).toContain(
      '"Declined, address was right"',
    );
  });
});

describe('exportFileStamp', () => {
  /** Late-evening UTC is already tomorrow in Morogoro; the filename should agree. */
  it('names the file by the East African day, not the UTC one', () => {
    expect(exportFileStamp(new Date('2026-09-08T22:30:00Z'))).toBe('2026-09-09');
    expect(exportFileStamp(new Date('2026-09-08T09:00:00Z'))).toBe('2026-09-08');
  });
});

describe('manifestCsv', () => {
  it('lists each file with its row count, hash and purpose', () => {
    const csv = manifestCsv([{ table: 'trainees', rows: 546, sha256: 'abc123' }]);
    expect(csv).toContain('"File","Rows","SHA-256 of the file","What it holds"');
    expect(csv).toContain('"trainees.csv","546","abc123"');
    expect(csv).toContain('The register');
  });
});

describe('readme', () => {
  const entries = [
    { table: 'trainees', rows: 546, sha256: 'a' },
    { table: 'assessment_mark_items', rows: 45_000, sha256: 'b' },
  ];

  it('says who took it, when, and how much is in it', () => {
    const text = readme('2026-09-08', entries, 'Lymo');
    expect(text).toContain('2026-09-08');
    expect(text).toContain('by Lymo');
    expect(text).toContain('45,546 rows');
  });

  /**
   * The two sentences that stop this being mistaken for a safety net it is
   * not. Both have to survive any future edit of this file.
   */
  it('states plainly that it is not a restore and holds no PDFs', () => {
    const text = readme('2026-09-08', entries, 'Lymo');
    expect(text).toContain('This is not a restore.');
    expect(text).toContain('The report PDFs are NOT in this archive.');
  });

  it('warns that it carries personal data', () => {
    expect(readme('2026-09-08', entries, 'Lymo')).toContain('personal data');
  });
});
