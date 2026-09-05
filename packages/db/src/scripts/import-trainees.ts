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
 * Expected shape (one sheet), repeated per route. Two route-header layouts
 * are accepted, because the College has now sent both:
 *
 *   ROUTE <n>              | | <Supervisor A1> & <Supervisor A2>   (original)
 *   ROUTE <n>: <A1> & <A2>                                          (FINAL VERSION)
 *
 * The second puts everything in the first cell, and writes some routes
 * without the space ("ROUTE5:"). Both are matched.
 *
 * Data columns are located by their HEADER TEXT, not by position. The
 * September 2026 "FINAL VERSION" inserted `Sex` after Registration Number and
 * `Mobile Number` before Email, which shifted every later column by one — a
 * fixed-index parser reads Sex as Course, Course as Mode of Study, and so on
 * down the row, silently, with no error to notice. Header lookup makes an
 * inserted column a non-event and an absent one an explicit throw.
 *
 *   No. | Student Name | Registration Number | [Sex] | Course | Mode of Study |
 *     Occpation | Institution | District | Region | [Mobile Number] | Email
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
  /** Present only in the FINAL VERSION register; '' when the column is absent. */
  phone: string;
  /** Present only in the FINAL VERSION register; '' when the column is absent.
   * Nothing stores this yet — `trainees` has no sex column — but it is parsed
   * so the data is not silently dropped on the floor. */
  sex: string;
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

/**
 * A route header. Either `ROUTE 1` on its own (supervisors then live in the
 * third cell) or `ROUTE 1: MKAMA MAUGO & YOHANA YONA` with everything in the
 * first. The colon form is sometimes written without the space — `ROUTE5:` —
 * in the September 2026 FINAL VERSION, hence `\s*` before the digits.
 */
const ROUTE_HEADER_PATTERN = new RegExp('^ROUTE\\s*(\\d+)\\s*(?::\\s*(.*))?$', 'i');

/** Header text -> RosterRow field. Matched case-insensitively after collapsing
 * whitespace, so "Institution  " and "institution" both land. "Occpation" is
 * the College's own spelling in the register and is kept verbatim; the
 * corrected spelling is accepted too, in case a later file fixes it. */
const COLUMN_ALIASES: Record<string, keyof RosterRow> = {
  'no.': 'no',
  'student name': 'name',
  'registration number': 'registrationNumber',
  sex: 'sex',
  course: 'course',
  'mode of study': 'modeOfStudy',
  occpation: 'occupation',
  occupation: 'occupation',
  institution: 'institution',
  district: 'district',
  region: 'region',
  'mobile number': 'phone',
  email: 'email',
};

/** The columns a row cannot be built without. `sex` and `phone` are absent
 * from the original register, so they are optional by design. */
const REQUIRED_COLUMNS: (keyof RosterRow)[] = [
  'no',
  'name',
  'registrationNumber',
  'course',
  'modeOfStudy',
  'occupation',
  'institution',
  'district',
  'region',
  'email',
];

type ColumnMap = Partial<Record<keyof RosterRow, number>>;

function readHeaderRow(row: ExcelJS.Row): ColumnMap | null {
  const map: ColumnMap = {};
  let matched = 0;
  row.eachCell({ includeEmpty: false }, (_cellValue, colNumber) => {
    const label = normalizeSpaces(cell(row, colNumber)).toLowerCase();
    const field = COLUMN_ALIASES[label];
    if (field && map[field] === undefined) {
      map[field] = colNumber;
      matched += 1;
    }
  });
  // "No." and "Student Name" together identify a header row without matching
  // a data row that happens to hold similar text.
  if (map.no === undefined || map.name === undefined || matched < 4) return null;
  return map;
}

export async function parseRoster(filePath: string): Promise<RosterRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error(`No worksheet found in ${filePath}`);

  const rows: RosterRow[] = [];
  let currentRoute: string | null = null;
  let currentSupervisors: [string, string] | null = null;
  let columns: ColumnMap | null = null;

  sheet.eachRow((row) => {
    const normalizedFirst = normalizeSpaces(cell(row, 1));

    const routeMatch = ROUTE_HEADER_PATTERN.exec(normalizedFirst);
    if (routeMatch) {
      currentRoute = `ROUTE ${routeMatch[1]}`;
      // Supervisors come from after the colon when the header carries them,
      // and from the third cell otherwise.
      const pairText = routeMatch[2]?.trim()
        ? routeMatch[2]
        : normalizeSpaces(cell(row, 3));
      const pair = normalizeSpaces(pairText)
        .split('&')
        .map((part) => part.trim());
      currentSupervisors = [pair[0] ?? '', pair[1] ?? ''];
      return;
    }

    const header = readHeaderRow(row);
    if (header) {
      const missing = REQUIRED_COLUMNS.filter((field) => header[field] === undefined);
      if (missing.length > 0) {
        throw new Error(
          `Header row is missing required column(s): ${missing.join(', ')} — in ${filePath}`,
        );
      }
      columns = header;
      return;
    }

    if (normalizedFirst === '') return;
    if (!currentRoute || !currentSupervisors || !columns) return;
    const no = Number(normalizedFirst);
    if (!Number.isFinite(no)) return;

    const at = (field: keyof RosterRow): string => {
      const col = columns![field];
      return col === undefined ? '' : cell(row, col);
    };

    rows.push({
      route: currentRoute,
      supervisors: currentSupervisors,
      no,
      name: at('name'),
      registrationNumber: at('registrationNumber'),
      course: at('course'),
      modeOfStudy: at('modeOfStudy'),
      occupation: at('occupation'),
      institution: at('institution'),
      district: at('district'),
      region: at('region'),
      phone: at('phone'),
      sex: at('sex'),
      email: at('email').toLowerCase(),
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
