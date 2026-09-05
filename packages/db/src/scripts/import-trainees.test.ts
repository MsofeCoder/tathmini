import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseRoster, validateRoster, type RosterRow } from './import-trainees';

const HEADERS = [
  'No.',
  'Student Name',
  'Registration Number',
  'Course',
  'Mode of Study',
  'Occpation',
  'Institution',
  'District',
  'Region',
  'Email',
];

async function writeFixture(
  path: string,
  routes: { code: string; supervisors: string; rows: unknown[][] }[],
) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Summary');
  for (const route of routes) {
    sheet.addRow([route.code, undefined, route.supervisors]);
    sheet.addRow(HEADERS);
    for (const row of route.rows) sheet.addRow(row);
    sheet.addRow([]);
  }
  await workbook.xlsx.writeFile(path);
}

describe('parseRoster / validateRoster', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tathmini-roster-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('parses trainees under their route and supervisor pair', async () => {
    const path = join(dir, 'roster.xlsx');
    await writeFixture(path, [
      {
        code: 'ROUTE 1',
        supervisors: 'Mkama Maugo & Yohana Yona',
        rows: [
          [
            1,
            'Augustina Nsemwa',
            'REG-0001',
            'CAVT',
            'In-Campus',
            'Food Production',
            'Arusha VTC',
            'Arusha',
            'Arusha',
            'a@example.test',
          ],
          [
            2,
            'Stela Kasekwa',
            'REG-0002',
            'CAVT',
            'In-Campus',
            'Food Production',
            'Arusha VTC',
            'Arusha',
            'Arusha',
            'b@example.test',
          ],
        ],
      },
    ]);

    const rows = await parseRoster(path);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.route).toBe('ROUTE 1');
    expect(rows[0]?.supervisors).toEqual(['Mkama Maugo', 'Yohana Yona']);
    expect(rows[1]?.name).toBe('Stela Kasekwa');
    expect(validateRoster(rows)).toHaveLength(0);
  });

  it('flags the exact duplicate registration number found in the real September 2026 register', async () => {
    const path = join(dir, 'roster.xlsx');
    await writeFixture(path, [
      {
        code: 'ROUTE 2',
        supervisors: 'Anicia Osward & Frank Urio',
        rows: [
          [
            34,
            'Rafael Pato Mohele',
            'MVTTC/CAVT/2025/0128',
            'CAVT',
            'In-Campus',
            'Electrical Installation',
            'ICOT (Ujenzi)',
            'Morogoro',
            'Morogoro',
            'raphaelpato89@gmail.com',
          ],
          [
            36,
            'Raphael Pato Mohele',
            'MVTTC/CAVT/2025/0128',
            'CAVT',
            'In-Campus',
            'Electrical Installation',
            'ICOTS',
            'Morogoro',
            'Morogoro',
            'raphaelpato261@gmail.com',
          ],
        ],
      },
    ]);

    const rows = await parseRoster(path);
    const issues = validateRoster(rows);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.kind).toBe('duplicate_registration_number');
    expect(issues[0]?.rows).toHaveLength(2);
  });

  it('flags the exact shared-email defect found in the real September 2026 register', async () => {
    const path = join(dir, 'roster.xlsx');
    await writeFixture(path, [
      {
        code: 'ROUTE 1',
        supervisors: 'Mkama Maugo & Yohana Yona',
        rows: [
          [
            30,
            'Mudabiru Mujwahuzi Mussa',
            'MVTTC/CAVT/2025/0338',
            'CAVT',
            'In-Campus',
            'Electrical Installation',
            'Chemba VTC',
            'Chemba',
            'Dodoma',
            'rashidmujwahuzi@gmail.com',
          ],
        ],
      },
      {
        code: 'ROUTE 2',
        supervisors: 'Anicia Osward & Frank Urio',
        rows: [
          [
            6,
            'Benard Tiago Raulent',
            'MVTTC/CAVT/2025/071',
            'CAVT',
            'In-Campus',
            'Fitter Mechanics',
            'Don Bosco Oysterbay VTC',
            'Kinondoni',
            'Dar Es Salaam',
            'rashidmujwahuzi@gmail.com',
          ],
        ],
      },
    ]);

    const rows = await parseRoster(path);
    const issues = validateRoster(rows);
    expect(issues.some((i) => i.kind === 'duplicate_email')).toBe(true);
  });

  it('reads a hyperlink-valued e-mail cell as its text, not "[object Object]" (real defect found importing the September 2026 TP roster)', async () => {
    const path = join(dir, 'roster.xlsx');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Summary');
    sheet.addRow(['ROUTE 1', undefined, 'Mkama Maugo & Yohana Yona']);
    sheet.addRow(HEADERS);
    sheet.addRow([
      1,
      'Trainee One',
      'REG-0001',
      'CAVT',
      'In-Campus',
      'Food Production',
      'Arusha VTC',
      'Arusha',
      'Arusha',
      { text: 'trainee.one@example.test', hyperlink: 'mailto:trainee.one@example.test' },
    ]);
    sheet.addRow([
      2,
      'Trainee Two',
      'REG-0002',
      'CAVT',
      'In-Campus',
      'Food Production',
      'Arusha VTC',
      'Arusha',
      'Arusha',
      { text: 'trainee.two@example.test', hyperlink: 'mailto:trainee.two@example.test' },
    ]);
    sheet.addRow([]);
    await workbook.xlsx.writeFile(path);

    const rows = await parseRoster(path);
    expect(rows[0]?.email).toBe('trainee.one@example.test');
    expect(rows[1]?.email).toBe('trainee.two@example.test');
    expect(validateRoster(rows)).toHaveLength(0);
  });

  it('flags a row missing a required field', () => {
    const row: RosterRow = {
      route: 'ROUTE 1',
      supervisors: ['A', 'B'],
      no: 1,
      name: '',
      registrationNumber: 'REG-0001',
      course: 'CAVT',
      modeOfStudy: 'In-Campus',
      occupation: 'Food Production',
      institution: 'Arusha VTC',
      district: 'Arusha',
      region: 'Arusha',
      phone: '',
      sex: '',
      email: 'a@example.test',
    };
    const issues = validateRoster([row]);
    expect(issues.some((i) => i.kind === 'missing_field')).toBe(true);
  });
});

/**
 * The September 2026 "FINAL VERSION" register. Two differences from the
 * original, both of which silently corrupted a fixed-index parser: the route
 * header carries the supervisors in its own cell after a colon (sometimes with
 * no space, "ROUTE5:"), and two columns were inserted mid-row.
 */
describe('parseRoster - FINAL VERSION layout', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tathmini-roster-final-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const FINAL_HEADERS = [
    'No.',
    'Student Name',
    'Registration Number',
    'Sex',
    'Course',
    'Mode of Study',
    'Occpation',
    'Institution  ',
    'District',
    'Region',
    'Mobile Number',
    'Email',
  ];

  async function writeFinalFixture(path: string) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('FINAL TP ROUTES');
    sheet.addRow(['MOROGORO VOCATIONAL TEACHERS TRAINING COLLEGE']);
    sheet.addRow(['TEACHING PRACTICE, SEPTEMBER 2026']);
    sheet.addRow([]);

    sheet.addRow(['ROUTE 1: MKAMA MAUGO & YOHANA YONA']);
    sheet.addRow(FINAL_HEADERS);
    sheet.addRow([
      1,
      'Augustina Nsemwa',
      'REG-0001',
      'Female',
      'CAVT',
      'In-Campus',
      'Food Production',
      'Arusha VTC',
      'Arusha',
      'Arusha',
      '624489157',
      'one@example.test',
    ]);

    // No space after ROUTE, exactly as routes 5-7 are written in the real file.
    sheet.addRow(['ROUTE5: NEHEMIA DAVID  &  LAURENT MWAISANILA']);
    sheet.addRow(FINAL_HEADERS);
    sheet.addRow([
      1,
      'Mlima Hamadi Iddi',
      'NS0108/0104/2017',
      'Male',
      'TC-TVTE',
      'ODeL',
      'Electrical Installation',
      'Veta Mbeya',
      'Mbeya',
      'Mbeya',
      '758353085',
      'two@example.test',
    ]);

    await workbook.xlsx.writeFile(path);
  }

  it('reads the route number and both supervisors out of the header cell', async () => {
    const path = join(dir, 'final.xlsx');
    await writeFinalFixture(path);

    const rows = await parseRoster(path);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.route).toBe('ROUTE 1');
    expect(rows[0]?.supervisors).toEqual(['MKAMA MAUGO', 'YOHANA YONA']);
  });

  it('matches a route header written without a space, as routes 5-7 are', async () => {
    const path = join(dir, 'final.xlsx');
    await writeFinalFixture(path);

    const rows = await parseRoster(path);
    expect(rows[1]?.route).toBe('ROUTE 5');
    expect(rows[1]?.supervisors).toEqual(['NEHEMIA DAVID', 'LAURENT MWAISANILA']);
  });

  it('maps columns by header, so the inserted Sex column does not shift the row', async () => {
    const path = join(dir, 'final.xlsx');
    await writeFinalFixture(path);

    const rows = await parseRoster(path);
    // A fixed-index parser reads Sex into course and cascades from there.
    expect(rows[0]?.course).toBe('CAVT');
    expect(rows[0]?.modeOfStudy).toBe('In-Campus');
    expect(rows[0]?.occupation).toBe('Food Production');
    expect(rows[0]?.region).toBe('Arusha');
    expect(rows[0]?.email).toBe('one@example.test');
    expect(rows[0]?.sex).toBe('Female');
  });

  it('captures the mobile number the original register did not carry', async () => {
    const path = join(dir, 'final.xlsx');
    await writeFinalFixture(path);

    const rows = await parseRoster(path);
    expect(rows[0]?.phone).toBe('624489157');
    expect(rows[1]?.phone).toBe('758353085');
  });

  it('accepts the file as valid apart from the defects it genuinely carries', async () => {
    const path = join(dir, 'final.xlsx');
    await writeFinalFixture(path);

    expect(validateRoster(await parseRoster(path))).toHaveLength(0);
  });
});
