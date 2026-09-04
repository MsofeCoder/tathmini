/**
 * Parses and validates the IPT route/assessor/trainee roster from the
 * College's real September 2026 workbook (e.g.
 * "IPT ASSESSMENT SEPTEMBER  2026.xls"). That workbook is mostly unrelated
 * staff-payment/logistics sheets (invigilation, marking, setting and
 * moderation allowances for a different process, semester module exams) —
 * only its first worksheet is the actual IPT roster this script reads.
 *
 * The source spreadsheet is never committed to this repository — it holds
 * real trainee names and phone numbers. Point this script at a local copy
 * via IPT_ROSTER_PATH; see .gitignore's `packages/db/data/` entry for
 * where to put it.
 *
 * A sibling to import-trainees.ts (the TP roster parser), not a rewrite of
 * it — the two source formats differ too much to share one parser: no
 * registration number or e-mail column here, route/assessor headers are a
 * single free-text cell instead of two separate columns, and the format
 * itself is inconsistent ("ROUT"/"ROUTE", "NO. 1"/"NO 3.") — see
 * MEMORY.md.
 *
 * Legacy binary .xls (not .xlsx), so ExcelJS (used by import-trainees.ts)
 * can't read it — this script uses `xlsx` (SheetJS) instead.
 *
 * This script only READS the spreadsheet and VALIDATES it. It does not
 * write to a database. The two data-quality questions validateIptRoster()
 * surfaces (missing registration numbers; trainees sharing a phone number
 * with someone else) are open questions for the user, not something this
 * script resolves on its own — see MEMORY.md.
 */

import { pathToFileURL } from 'node:url';
import XLSX from 'xlsx';

export interface IptRosterRow {
  route: string;
  regionCode: string;
  assessors: [string, string];
  sn: number;
  name: string;
  sex: string;
  trade: string;
  region: string;
  district: string;
  company: string;
  phone: string;
}

export interface ValidationIssue {
  kind: 'duplicate_phone' | 'missing_field';
  detail: string;
  rows: IptRosterRow[];
}

/** Collapses runs of whitespace, including a non-breaking space (NBSP), to one regular space. */
function normalizeSpaces(value: string): string {
  const NBSP = String.fromCharCode(160);
  return value.split(NBSP).join(' ').split(/\s+/).join(' ').trim();
}

function cell(row: unknown[], col: number): string {
  const v = row[col];
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

// Tolerates every real inconsistency seen in the September 2026 workbook:
// "ROUT" vs "ROUTE", a dot after "NO" vs after the digit vs no dot at all,
// and inconsistent spacing throughout.
const ROUTE_HEADER_PATTERN = /^ROUTE?\s*NO\.?\s*(\d+)\.?\s+(.+?)\s+ASSESSORS:\s*(.+?)\s*&\s*(.+)$/i;

export async function parseIptRoster(filePath: string): Promise<IptRosterRow[]> {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) throw new Error(`No worksheet found in ${filePath}`);
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });

  const rows: IptRosterRow[] = [];
  let currentRoute: string | null = null;
  let currentRegionCode: string | null = null;
  let currentAssessors: [string, string] | null = null;

  for (const rawRow of raw) {
    const first = normalizeSpaces(cell(rawRow, 0));
    const second = normalizeSpaces(cell(rawRow, 1));

    // A route header is free text spanning column [1] (column [0] is
    // blank), not column [0] like the TP roster's route header.
    const headerMatch = ROUTE_HEADER_PATTERN.exec(second || first);
    if (headerMatch) {
      currentRoute = `Route ${headerMatch[1]}`;
      currentRegionCode = headerMatch[2] ?? '';
      currentAssessors = [(headerMatch[3] ?? '').trim(), (headerMatch[4] ?? '').trim()];
      continue;
    }

    // Column-header row ("SN | NAME | SEX | ...") and stray sub-label rows
    // (e.g. a lone "KILIMANJARO" cell with no SN) both fail this check.
    if (first === 'SN' || first === '') continue;
    const sn = Number(first);
    if (!Number.isFinite(sn) || !currentRoute || !currentAssessors) continue;

    rows.push({
      route: currentRoute,
      regionCode: currentRegionCode ?? '',
      assessors: currentAssessors,
      sn,
      name: cell(rawRow, 1),
      sex: cell(rawRow, 2),
      trade: cell(rawRow, 3),
      region: cell(rawRow, 4),
      district: cell(rawRow, 5),
      company: cell(rawRow, 6),
      phone: cell(rawRow, 7),
    });
  }

  return rows;
}

/**
 * Catches the two defect classes already known from the September 2026
 * roster (see MEMORY.md): trainees with no way to be told apart from a
 * duplicate entry, and trainees sharing a contact number with someone
 * else entirely (their results would reach the wrong phone). Does not
 * flag same-name-different-phone as a duplicate — common names recur
 * across a national roster and a false positive there is worse than a
 * missed one; every real duplicate found so far shares a phone number.
 */
export function validateIptRoster(rows: IptRosterRow[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const byPhone = new Map<string, IptRosterRow[]>();
  for (const row of rows) {
    if (row.phone) {
      const list = byPhone.get(row.phone) ?? [];
      list.push(row);
      byPhone.set(row.phone, list);
    }
    if (!row.name || !row.trade || !row.phone) {
      issues.push({
        kind: 'missing_field',
        detail: `${row.route} row ${row.sn}: missing a required field`,
        rows: [row],
      });
    }
  }

  for (const [phone, dupRows] of byPhone) {
    if (dupRows.length > 1) {
      const distinctNames = new Set(dupRows.map((r) => r.name.toLowerCase()));
      const sameOrDifferent = distinctNames.size === 1 ? 'the same name' : 'different names';
      issues.push({
        kind: 'duplicate_phone',
        detail: `Phone ${phone} used by ${dupRows.length} rows across ${new Set(dupRows.map((r) => r.route)).size} route(s), ${sameOrDifferent}: ${dupRows.map((r) => `${r.name} (${r.route})`).join(', ')}`,
        rows: dupRows,
      });
    }
  }

  return issues;
}

async function main() {
  const filePath = process.env.IPT_ROSTER_PATH;
  if (!filePath) {
    console.error('Set IPT_ROSTER_PATH to a local copy of the IPT roster workbook.');
    process.exitCode = 1;
    return;
  }

  const rows = await parseIptRoster(filePath);
  const routes = new Set(rows.map((r) => r.route));
  const assessors = new Set(rows.flatMap((r) => r.assessors));
  console.log(
    `Parsed ${rows.length} trainee rows across ${routes.size} routes and ${assessors.size} assessors.`,
  );

  const issues = validateIptRoster(rows);
  if (issues.length > 0) {
    console.error(`${issues.length} validation issue(s) found:`);
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
