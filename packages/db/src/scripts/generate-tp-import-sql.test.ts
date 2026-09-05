import { describe, expect, it } from 'vitest';
import {
  dedupeRegistrationNumbers,
  generateAssignmentsSql,
  generateMigrationSql,
  generateRoutesSql,
  generateTraineesSql,
  generateUsersSql,
} from './generate-tp-import-sql';
import type { RosterRow } from './import-trainees';

function row(overrides: Partial<RosterRow>): RosterRow {
  return {
    route: 'ROUTE 1',
    supervisors: ['Mkama Maugo', 'Yohana Yona'],
    no: 1,
    name: 'Trainee One',
    registrationNumber: 'REG-0001',
    course: 'CAVT',
    modeOfStudy: 'In-Campus',
    phone: '',
    sex: '',
    occupation: 'Food Production',
    institution: 'Arusha VTC',
    district: 'Arusha',
    region: 'Arusha',
    email: 'a@example.test',
    ...overrides,
  };
}

describe('generateUsersSql / generateRoutesSql / generateAssignmentsSql', () => {
  it("produces a guarded insert referencing every route's two assessor accounts, including the shared Adam Msofe email once", () => {
    const usersSql = generateUsersSql();
    expect(usersSql).toContain('not exists');
    expect(usersSql).toContain('mkama.maugo@tathmini.internal');
    expect(usersSql).toContain('adam.msofe.supervisor@tathmini.internal');
    // Adam Msofe's email must appear exactly once, not duplicated across
    // his own route and being pulled in generically.
    const occurrences = usersSql.split('adam.msofe.supervisor@tathmini.internal').length - 1;
    expect(occurrences).toBe(1);
  });

  it('generates all 9 TP routes, guarded, with a distinct TP-prefixed code', () => {
    const sql = generateRoutesSql();
    for (let i = 1; i <= 9; i++) expect(sql).toContain(`'TP ROUTE ${i}'`);
    expect(sql).toContain('not exists');
  });

  it("generates both assignment slots, scoped to track = 'TP'", () => {
    const sql = generateAssignmentsSql();
    expect(sql).toContain("'a1'");
    expect(sql).toContain("'a2'");
    expect(sql).toMatch(/track = 'TP'/g);
  });
});

describe('generateTraineesSql', () => {
  it('emits one tuple per row, real values (not invented), NOT EXISTS-guarded', () => {
    const rows = [row({ name: 'Trainee A' }), row({ name: 'Trainee B', no: 2 })];
    const sql = generateTraineesSql(rows);
    expect(sql).toContain("'Trainee A'");
    expect(sql).toContain("'Trainee B'");
    expect(sql).toContain('not exists');
    expect(sql).toContain("'CAVT'");
  });

  it('escapes an embedded single quote safely', () => {
    const sql = generateTraineesSql([row({ institution: "St. Mary's VTC" })]);
    expect(sql).toContain("St. Mary''s VTC");
  });

  it('does not drop a known real duplicate (same registration number, two names) — both rows are emitted', () => {
    const rows = [
      row({ name: 'Rafael Pato Mohele', registrationNumber: 'MVTTC/CAVT/2025/0128' }),
      row({ name: 'Raphael Pato Mohele', registrationNumber: 'MVTTC/CAVT/2025/0128', no: 2 }),
    ];
    const sql = generateTraineesSql(rows);
    expect(sql).toContain('Rafael Pato Mohele');
    expect(sql).toContain('Raphael Pato Mohele');
  });
});

describe('dedupeRegistrationNumbers', () => {
  it('keeps the first occurrence of a shared registration number and blanks later ones (trainees_registration_number_unique is a hard DB constraint, not just messy data)', () => {
    const rows = [
      row({ name: 'Rafael Pato Mohele', registrationNumber: 'MVTTC/CAVT/2025/0128' }),
      row({ name: 'Raphael Pato Mohele', registrationNumber: 'MVTTC/CAVT/2025/0128', no: 2 }),
    ];
    const [first, second] = dedupeRegistrationNumbers(rows);
    expect(first?.registrationNumber).toBe('MVTTC/CAVT/2025/0128');
    expect(second?.registrationNumber).toBe('');
  });

  it('leaves rows with distinct or missing registration numbers untouched', () => {
    const rows = [
      row({ name: 'Trainee A', registrationNumber: 'REG-A' }),
      row({ name: 'Trainee B', registrationNumber: 'REG-B', no: 2 }),
      row({ name: 'Trainee C', registrationNumber: '', no: 3 }),
    ];
    expect(dedupeRegistrationNumbers(rows).map((r) => r.registrationNumber)).toEqual([
      'REG-A',
      'REG-B',
      '',
    ]);
  });

  it('the generated SQL for a deduped pair has the real number once and null for the other', () => {
    const rows = [
      row({ name: 'Rafael Pato Mohele', registrationNumber: 'MVTTC/CAVT/2025/0128' }),
      row({ name: 'Raphael Pato Mohele', registrationNumber: 'MVTTC/CAVT/2025/0128', no: 2 }),
    ];
    const sql = generateTraineesSql(rows);
    expect(sql).toContain("'Rafael Pato Mohele', 'MVTTC/CAVT/2025/0128'");
    expect(sql).toContain("'Raphael Pato Mohele', null");
  });
});

describe('generateMigrationSql', () => {
  it('assembles all four sections into one file with the real row count in its header comment', () => {
    const rows = [row({}), row({ name: 'Trainee Two', no: 2 })];
    const sql = generateMigrationSql(rows);
    expect(sql).toContain('2 trainees');
    expect(sql).toContain('insert into users');
    expect(sql).toContain('insert into routes');
    expect(sql).toContain('insert into trainees');
    expect(sql).toContain('insert into assignments');
  });
});
