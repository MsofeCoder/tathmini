/**
 * Imports the TP trainee/route/supervisor roster from the College's Excel
 * register (e.g. "TEACHING PRACTICE TRAINEES SEPTEMBER 2026.xlsx") into
 * routes, trainees and assignments.
 *
 * The source spreadsheet is never committed to this repository — it holds
 * real trainee names and personal e-mail addresses. Point this script at a
 * local copy via TRAINEE_REGISTER_PATH; see .gitignore's `packages/db/data/`
 * entry for where to put it.
 *
 * Expected shape (one sheet, "Summary"), repeated per route:
 *   ROUTE <n> | | <Supervisor A1> & <Supervisor A2> | ...
 *   No. | Student Name | Registration Number | Course | Mode of Study |
 *     Occpation | Institution | District | Region | Email
 *   <data rows...>
 *   <blank row>
 *
 * This script only READS the spreadsheet and VALIDATES it — see
 * validateRoster() below. It does not yet write to a database (no
 * DATABASE_URL is configured anywhere in this project). Wire up the actual
 * insert once a Supabase project exists; the validation is the part worth
 * having ready now, since the source file has already been through one
 * round of real data-quality issues (see MEMORY.md).
 */

import { pathToFileURL } from 'node:url';
import ExcelJS from 'exceljs';

export interface RosterRow {
  route: string;
  supervisors: [string, string];
  no: number;
  name: string;
  registrationNumber: string;
  course: string;
  modeOfStudy: string;
  occupation: string;
  institution: string;
  district: string;
  region: string;
  email: string;
}

export interface ValidationIssue {
  kind: 'duplicate_registration_number' | 'duplicate_email' | 'missing_field';
  detail: string;
  rows: RosterRow[];
}

/**
 * ExcelJS represents some cells as an object rather than a primitive —
 * a hyperlink (`mailto:` links on an email column, in practice, are
 * exactly this), rich text, or a formula result. `String(v)` on any of
 * these silently produces the literal text "[object Object]" instead of
 * throwing, so a naive cell() falsely flagged 17 real, distinct e-mail
 * addresses as one "duplicate" shared by all of them — found importing
 * the real September 2026 roster. See MEMORY.md.
 */
function cell(row: ExcelJS.Row, col: number): string {
  const v = row.getCell(col).value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if ('text' in v && typeof v.text === 'string') return v.text.trim();
    if ('richText' in v && Array.isArray(v.richText)) {
      return v.richText
        .map((r) => r.text)
        .join('')
        .trim();
    }
    if ('result' in v && v.result !== null && v.result !== undefined) {
      return String(v.result).trim();
    }
    if (v instanceof Date) return v.toISOString().trim();
    return '';
  }
  return String(v).trim();
}

/** Collapses runs of whitespace, including a non-breaking space (NBSP), to one regular space. */
function normalizeSpaces(value: string): string {
  const NBSP = String.fromCharCode(160);
  return value.split(NBSP).join(' ').split(/\s+/).join(' ').trim();
}

const ROUTE_HEADER_PATTERN = new RegExp('^ROUTE\\s*\\d+$', 'i');

export async function parseRoster(filePath: string): Promise<RosterRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error(`No worksheet found in ${filePath}`);

  const rows: RosterRow[] = [];
  let currentRoute: string | null = null;
  let currentSupervisors: [string, string] | null = null;

  sheet.eachRow((row) => {
    const first = cell(row, 1);
    const normalizedFirst = normalizeSpaces(first);
    if (ROUTE_HEADER_PATTERN.test(normalizedFirst)) {
      currentRoute = normalizedFirst;
      const pair = normalizeSpaces(cell(row, 3))
        .split('&')
        .map((s) => s.trim());
      currentSupervisors = [pair[0] ?? '', pair[1] ?? ''];
      return;
    }
    if (first === 'No.' || first === '') return;
    const no = Number(first);
    if (!Number.isFinite(no) || !currentRoute || !currentSupervisors) return;

    rows.push({
      route: currentRoute,
      supervisors: currentSupervisors,
      no,
      name: cell(row, 2),
      registrationNumber: cell(row, 3),
      course: cell(row, 4),
      modeOfStudy: cell(row, 5),
      occupation: cell(row, 6),
      institution: cell(row, 7),
      district: cell(row, 8),
      region: cell(row, 9),
      email: cell(row, 10).toLowerCase(),
    });
  });

  return rows;
}

/** Catches exactly the two defect classes found in the September 2026 register. */
export function validateRoster(rows: RosterRow[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const byReg = new Map<string, RosterRow[]>();
  const byEmail = new Map<string, RosterRow[]>();
  for (const row of rows) {
    if (row.registrationNumber) {
      const list = byReg.get(row.registrationNumber) ?? [];
      list.push(row);
      byReg.set(row.registrationNumber, list);
    }
    if (row.email) {
      const list = byEmail.get(row.email) ?? [];
      list.push(row);
      byEmail.set(row.email, list);
    }
    if (!row.name || !row.registrationNumber || !row.email || !row.occupation || !row.institution) {
      issues.push({
        kind: 'missing_field',
        detail: `Route ${row.route} row ${row.no}: missing a required field`,
        rows: [row],
      });
    }
  }

  for (const [reg, dupRows] of byReg) {
    if (dupRows.length > 1) {
      issues.push({
        kind: 'duplicate_registration_number',
        detail: `Registration number ${reg} used by ${dupRows.length} rows: ${dupRows.map((r) => r.name).join(', ')}`,
        rows: dupRows,
      });
    }
  }
  for (const [email, dupRows] of byEmail) {
    if (dupRows.length > 1) {
      issues.push({
        kind: 'duplicate_email',
        detail: `Email ${email} used by ${dupRows.length} different trainees: ${dupRows.map((r) => r.name).join(', ')}`,
        rows: dupRows,
      });
    }
  }

  return issues;
}

async function main() {
  const filePath = process.env.TRAINEE_REGISTER_PATH;
  if (!filePath) {
    console.error('Set TRAINEE_REGISTER_PATH to a local copy of the roster spreadsheet.');
    process.exitCode = 1;
    return;
  }

  const rows = await parseRoster(filePath);
  const routes = new Set(rows.map((r) => r.route));
  console.log(`Parsed ${rows.length} trainee rows across ${routes.size} routes.`);

  const issues = validateRoster(rows);
  if (issues.length > 0) {
    console.error(`${issues.length} validation issue(s) found — fix the source file and re-run:`);
    for (const issue of issues) console.error(`  [${issue.kind}] ${issue.detail}`);
    process.exitCode = 1;
    return;
  }

  console.log('Roster is valid. No DATABASE_URL wired up yet — nothing was written.');
}

// Naive `file://${process.argv[1]}` comparison never matches on Windows
// (import.meta.url is `file:///C:/...`, argv[1] is `C:\...`) — pathToFileURL
// normalizes both correctly cross-platform.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
