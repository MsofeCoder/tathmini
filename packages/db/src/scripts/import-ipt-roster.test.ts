import XLSX from 'xlsx';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseIptRoster, validateIptRoster, type IptRosterRow } from './import-ipt-roster';

const HEADER_ROW = ['SN', 'NAME', 'SEX', 'TRADE', 'REGIONAL', 'DISTRICT', 'COMPANY', 'PHONE NO'];

function writeFixture(path: string, rows: unknown[][]) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'SETTING AND MODERATION JAN 2026');
  XLSX.writeFile(workbook, path);
}

describe('parseIptRoster / validateIptRoster', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tathmini-ipt-roster-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('parses the four real route-header forms found in the September 2026 workbook', async () => {
    const path = join(dir, 'roster.xlsx');
    writeFixture(path, [
      [
        undefined,
        '      ROUT NO. 1                      TESTA/TESTB  ASSESSORS:  Asha Juma & Baraka Simba',
      ],
      HEADER_ROW,
      [1, 'Trainee One', 'Male', 'Electrical', 'TESTA', 'District A', 'Company A', '700000001'],
      [undefined, 'ROUTE NO. 2        TESTC/TESTD   ASSESSORS: Colman Dodi & Diana Elia'],
      HEADER_ROW,
      [1, 'Trainee Two', 'Female', 'Civil', 'TESTC', 'District C', 'Company C', '700000002'],
      [undefined, 'ROUTE NO 3.   TESTE/TESTF      ASSESSORS: Erick Fadhili & Grace Halima'],
      HEADER_ROW,
      [1, 'Trainee Three', 'Male', 'Mechanical', 'TESTE', 'District E', 'Company E', '700000003'],
      [undefined, 'ROUTE NO 4    TESTG/TESTH    ASSESSORS: Isaya Joel & Kessy Lucas'],
      HEADER_ROW,
      [1, 'Trainee Four', 'Female', 'Food', 'TESTG', 'District G', 'Company G', '700000004'],
    ]);

    const rows = await parseIptRoster(path);
    expect(rows).toHaveLength(4);
    expect(rows[0]?.route).toBe('Route 1');
    expect(rows[0]?.assessors).toEqual(['Asha Juma', 'Baraka Simba']);
    expect(rows[1]?.route).toBe('Route 2');
    expect(rows[1]?.assessors).toEqual(['Colman Dodi', 'Diana Elia']);
    expect(rows[2]?.route).toBe('Route 3');
    expect(rows[3]?.route).toBe('Route 4');
    expect(rows[3]?.assessors).toEqual(['Isaya Joel', 'Kessy Lucas']);
    expect(validateIptRoster(rows)).toHaveLength(0);
  });

  it('does not parse a stray sub-label row (e.g. a lone region name) as trainee data', async () => {
    const path = join(dir, 'roster.xlsx');
    writeFixture(path, [
      [undefined, 'ROUTE NO. 1   TESTA/TESTB   ASSESSORS: Asha Juma & Baraka Simba'],
      HEADER_ROW,
      [undefined, undefined, undefined, undefined, 'TESTB'],
      [1, 'Trainee One', 'Male', 'Electrical', 'TESTA', 'District A', 'Company A', '700000001'],
    ]);

    const rows = await parseIptRoster(path);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('Trainee One');
  });

  it('flags the same-name-same-phone defect pattern found in the real September 2026 roster (e.g. "Adeni Mwanitu")', async () => {
    const path = join(dir, 'roster.xlsx');
    writeFixture(path, [
      [undefined, 'ROUTE NO. 2   TESTC/TESTD   ASSESSORS: Colman Dodi & Diana Elia'],
      HEADER_ROW,
      [13, 'Test Person', 'Male', 'Civil', 'TESTC', 'District C', 'Company C', '684419544'],
      [undefined, 'ROUTE NO 4   TESTG/TESTH   ASSESSORS: Isaya Joel & Kessy Lucas'],
      HEADER_ROW,
      [6, 'Test Person', 'Male', 'Civil', 'TESTG', 'District G', 'Company G', '684419544'],
    ]);

    const rows = await parseIptRoster(path);
    const issues = validateIptRoster(rows);
    const dup = issues.find((i) => i.kind === 'duplicate_phone');
    expect(dup).toBeDefined();
    expect(dup?.rows).toHaveLength(2);
    expect(dup?.detail).toContain('the same name');
  });

  it('flags the different-name-same-phone defect pattern found in the real September 2026 roster (e.g. Philomena Kuzenza / Hemedi Hemedi)', async () => {
    const path = join(dir, 'roster.xlsx');
    writeFixture(path, [
      [undefined, 'ROUTE NO. 2   TESTC/TESTD   ASSESSORS: Colman Dodi & Diana Elia'],
      HEADER_ROW,
      [26, 'Trainee A', 'Female', 'Electrical', 'TESTC', 'District C', 'Company C', '783944072'],
      [undefined, 'ROUTE NO. 5   TESTI/TESTJ   ASSESSORS: Mary Ngowi & Neema Omary'],
      HEADER_ROW,
      [3, 'Trainee B', 'Male', 'Civil', 'TESTI', 'District I', 'Company I', '783944072'],
    ]);

    const rows = await parseIptRoster(path);
    const issues = validateIptRoster(rows);
    const dup = issues.find((i) => i.kind === 'duplicate_phone');
    expect(dup).toBeDefined();
    expect(dup?.detail).toContain('different names');
  });

  it('flags a row missing a required field', () => {
    const row: IptRosterRow = {
      route: 'Route 1',
      regionCode: 'TESTA/TESTB',
      assessors: ['Asha Juma', 'Baraka Simba'],
      sn: 1,
      name: 'Trainee One',
      sex: 'Male',
      trade: 'Electrical',
      region: 'TESTA',
      district: 'District A',
      company: 'Company A',
      phone: '',
    };
    const issues = validateIptRoster([row]);
    expect(issues.some((i) => i.kind === 'missing_field')).toBe(true);
  });
});
