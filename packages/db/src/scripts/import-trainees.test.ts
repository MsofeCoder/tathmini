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
      email: 'a@example.test',
    };
    const issues = validateRoster([row]);
    expect(issues.some((i) => i.kind === 'missing_field')).toBe(true);
  });
});
