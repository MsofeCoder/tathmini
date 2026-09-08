import { csvRow } from '../reports/zip';

/**
 * The College's own copy of the assessment data, as CSV.
 *
 * The report backup (`/api/admin/report-backup`) covers the finished PDFs and
 * says so in its own README: marks, results and the audit trail are not in it.
 * This is the other half — the rows themselves, in a format that opens in
 * Excel and can be read in twenty years without this application, or Supabase,
 * or Postgres.
 *
 * **It is not a restore.** A CSV export cannot rebuild the database on its
 * own: it carries no constraints, no policies, no functions, and re-importing
 * it would be careful manual work. What it does buy is that the assessment
 * itself — who marked whom, what they scored, what the College certified —
 * survives losing the project entirely. On the Free plan, which has no
 * automatic backups, that is the difference between an incident and a
 * disaster.
 *
 * Everything here is pure so the shape of the export can be tested without a
 * database; the route streams it.
 */

export interface ExportTable {
  /** Table name, and the CSV filename it becomes. */
  table: string;
  /** Column to sort by, so two exports of unchanged data are byte-identical. */
  orderBy: string;
  /** Printed in the README — what this file is for, in the College's terms. */
  purpose: string;
}

/**
 * Every table, deliberately — a backup that omits something is discovered to
 * have omitted it at the worst possible moment.
 *
 * The ordering is narrative rather than alphabetical: who and what first, then
 * the assessment, then the record of what was done. Someone opening this
 * archive years from now reads it in that order.
 *
 * `instruments` and `criteria` are reproducible from the seed code, and they
 * are still here: without them `assessment_mark_items` is a list of scores
 * against opaque uuids, which is not a record of anything.
 */
export const EXPORT_TABLES: ExportTable[] = [
  { table: 'users', orderBy: 'name', purpose: 'Every account, its role and whether it is active.' },
  { table: 'routes', orderBy: 'code', purpose: 'The routes and their two assessor slots.' },
  {
    table: 'trainees',
    orderBy: 'name',
    purpose: 'The register: every trainee and their particulars.',
  },
  {
    table: 'assignments',
    orderBy: 'trainee_id',
    purpose: 'Which supervisor holds which assessor slot for which trainee.',
  },
  {
    table: 'instruments',
    orderBy: 'code',
    purpose: 'The three assessment instruments (TP Theory, TP Practical, IPT).',
  },
  {
    table: 'criteria',
    orderBy: 'instrument_id',
    purpose: 'Every criterion, verbatim from the VETA forms — what each score was awarded against.',
  },
  {
    table: 'assessment_marks',
    orderBy: 'trainee_id',
    purpose: 'One row per assessor per instrument: the submitted mark and its total.',
  },
  {
    table: 'assessment_mark_items',
    orderBy: 'assessment_mark_id',
    purpose: 'The individual criterion scores behind every total. The largest file here.',
  },
  {
    table: 'assessment_mark_section_comments',
    orderBy: 'assessment_mark_id',
    purpose: 'Section comments written alongside the scores.',
  },
  {
    table: 'results',
    orderBy: 'trainee_id',
    purpose: 'The official averaged result: percentage, grade, GPA, class of award, verdict.',
  },
  {
    table: 'result_revisions',
    orderBy: 'result_id',
    purpose: 'Any superseding correction to a result, with its typed reason.',
  },
  {
    table: 'reports',
    orderBy: 'generated_at',
    purpose:
      'One row per generated PDF, with the SHA-256 that proves a file in the report backup is the one issued.',
  },
  {
    table: 'reassignments',
    orderBy: 'created_at',
    purpose: 'Slot hand-overs between supervisors.',
  },
  {
    table: 'trainee_change_requests',
    orderBy: 'created_at',
    purpose: 'Corrections supervisors asked for, and what was decided.',
  },
  {
    table: 'voided_assessments',
    orderBy: 'voided_at',
    purpose: 'Assessments returned to "Not yet assessed", archived whole before they were cleared.',
  },
  {
    table: 'notifications',
    orderBy: 'created_at',
    purpose: 'What the system sent, to whom, and whether it arrived.',
  },
  {
    table: 'audit_log',
    orderBy: 'created_at',
    purpose: 'The hash-chained record of every write. The file to keep if you keep only one.',
  },
];

/**
 * A value as CSV.
 *
 * `csvField` takes strings and numbers; the database also returns booleans,
 * nulls and jsonb. A boolean written as `true`/`false` reads correctly in
 * every spreadsheet, and jsonb is emitted as JSON rather than
 * `[object Object]` — the audit log's `before`/`after` columns are jsonb, and
 * they are the most valuable thing in this export.
 */
export function csvValue(value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return JSON.stringify(value);
}

/**
 * Rows to a CSV sheet, header taken from the first row.
 *
 * An empty table yields an empty string, and the file is written anyway: a
 * zero-byte `voided_assessments.csv` says "nothing has been voided", whereas a
 * missing file cannot be told apart from a backup that failed halfway.
 *
 * Later rows are read through the FIRST row's keys, so a column appearing
 * mid-table cannot shift every subsequent value one place left — the failure
 * that makes a CSV look fine and be wrong.
 */
export function toCsv(rows: readonly Record<string, unknown>[]): string {
  const first = rows[0];
  if (!first) return '';
  const columns = Object.keys(first);
  let out = csvRow(columns);
  for (const row of rows) out += csvRow(columns.map((column) => csvValue(row[column])));
  return out;
}

/** `2026-09-08`, in East African wall-clock terms rather than UTC. */
export function exportFileStamp(date: Date): string {
  return new Date(date.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export interface ManifestEntry {
  table: string;
  rows: number;
  sha256: string;
}

/** The index of the archive: what was taken, how much of it, and its hash. */
export function manifestCsv(entries: readonly ManifestEntry[]): string {
  let out = csvRow(['File', 'Rows', 'SHA-256 of the file', 'What it holds']);
  for (const entry of entries) {
    const purpose = EXPORT_TABLES.find((t) => t.table === entry.table)?.purpose ?? '';
    out += csvRow([`${entry.table}.csv`, entry.rows, entry.sha256, purpose]);
  }
  return out;
}

export function readme(stamp: string, entries: readonly ManifestEntry[], takenBy: string): string {
  const total = entries.reduce((sum, e) => sum + e.rows, 0);

  return [
    'TATHMINI — ASSESSMENT DATA EXPORT',
    'Morogoro Vocational Teachers Training College',
    '',
    `Taken: ${stamp} (East Africa Time), by ${takenBy}`,
    `Contents: ${entries.length} files, ${total.toLocaleString('en-GB')} rows in total`,
    '',
    'WHAT THIS IS',
    'The assessment data itself, one CSV per table: the register, every mark each',
    'assessor submitted, the criterion-by-criterion scores behind those marks, the',
    'official averaged results, and the audit trail. manifest.csv lists every file',
    'with its row count and a SHA-256 hash, so a file can be checked years later.',
    '',
    'It opens in Excel, LibreOffice or any text editor. It does not need this',
    'application, or Supabase, or Postgres, to be read.',
    '',
    'WHAT THIS IS NOT',
    'This is not a restore. These files carry no constraints, no security policies',
    'and no database functions; rebuilding a working system from them would be',
    'careful manual work, not a button. It is also a snapshot of one moment — it',
    'does not update itself.',
    '',
    'The report PDFs are NOT in this archive. They are a separate download in the',
    'same screen ("Download the report backup"). Keep both.',
    '',
    'KEEPING IT',
    'Keep this somewhere other than the computer that downloaded it, and somewhere',
    'other than the account that holds the database. A copy on the same laptop as',
    'the original is not a backup of anything.',
    '',
    'It holds personal data — every trainee’s name, e-mail address and phone',
    'number, and every mark awarded to them. Treat it as the College treats its',
    'paper assessment records.',
    '',
    'CHECKING A FILE',
    'On Windows:   certutil -hashfile "<file>" SHA256',
    'On Mac/Linux: shasum -a 256 "<file>"',
    'Compare the result with the hash in manifest.csv.',
    '',
  ].join('\n');
}
