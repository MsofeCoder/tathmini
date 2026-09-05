/**
 * Applies the admin's OWN chosen passwords, from a spreadsheet, to real
 * supervisor accounts — one row per account, in bulk.
 *
 * This is the "admin assigns the password" flow the College asked for
 * (2026-09-05). It differs from `reset-passwords.ts` in one decisive
 * way, and the difference is a deliberate, user-made decision recorded
 * in MEMORY.md: a password assigned here is **permanent**. It clears
 * `must_change_password` instead of setting it, so the supervisor is
 * NOT forced to change it on first sign-in. The College keeps the
 * spreadsheet and can re-tell a supervisor their password.
 *
 * The trade-off that buys: whoever holds that spreadsheet can sign in as
 * any supervisor on it, and `assessment_marks` rows are attributable to
 * a named assessor. Keep the file off shared drives and out of e-mail.
 * The two guards this script can enforce, it does — a minimum length,
 * and no two accounts sharing a password.
 *
 * Usage (run from the repo root):
 *
 *   # 1. Write a starter workbook, pre-filled with all 30 usernames.
 *   pnpm --filter @tathmini/db assign:passwords -- --template=passwords.xlsx
 *
 *   # 2. Open it, type a password beside each person, save.
 *
 *   # 3. Check what would happen — no writes.
 *   pnpm --filter @tathmini/db assign:passwords -- --file=passwords.xlsx --dry-run
 *
 *   # 4. Apply.
 *   pnpm --filter @tathmini/db assign:passwords -- --file=passwords.xlsx
 *
 * A row left blank in the Password column gets a memorable generated one
 * (`simba-moto-4821`) rather than being skipped — see
 * generateMemorablePassword below. A row whose username is not a real
 * account is an error, not a silent skip.
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY; see admin-client.ts.
 * That key bypasses RLS entirely and is never held by an agent
 * (AGENTS.md) — run this yourself, locally.
 */

import { randomInt } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import { PASSWORD_WORDS } from '../data/password-words';
import type { AccountSeed } from '../data/ipt-accounts';
import {
  createAdminClient,
  MISSING_ENV_MESSAGE,
  resolveEnv,
  type AdminClient,
} from './admin-client';
import { REAL_ACCOUNTS } from './reset-passwords';

/** Matches the minimum the in-app /change-password screen enforces. */
export const MIN_PASSWORD_LENGTH = 8;

const HEADERS = ['Username', 'Name', 'Role', 'Password'] as const;

// ── Memorable passwords ───────────────────────────────────────────

/**
 * `simba-moto-4821` — two words from PASSWORD_WORDS plus four digits.
 *
 * Shape chosen for a password that is now typed at EVERY sign-in, not
 * once: 15 characters, lowercase, no shift key, no ambiguous glyphs, and
 * dictatable over a phone line to a tutor standing in a village.
 *
 * Keyspace is 162^2 x 10^4, about 2^28. That is deliberately weaker than
 * the 16-character random string in create-accounts.ts, and it is the
 * correct trade here: these passwords are permanent and typed daily, and
 * an unusable credential gets written on a piece of paper and shared,
 * which is a worse outcome than a smaller keyspace behind Supabase Auth's
 * own sign-in rate limiting. It is a fallback for blank rows — an admin
 * who wants more should type their own password into the sheet.
 */
export function generateMemorablePassword(
  words: string[] = PASSWORD_WORDS,
  random: (max: number) => number = randomInt,
): string {
  const digits = String(random(10000)).padStart(4, '0');
  return `${pick(words, random)}-${pick(words, random)}-${digits}`;
}

/**
 * Throws rather than returning undefined. Without this, an out-of-range
 * `random` would put the literal text "undefined" into a real
 * supervisor's password and nothing would notice until they could not
 * sign in.
 */
function pick(words: string[], random: (max: number) => number): string {
  if (words.length === 0) throw new Error('Word list is empty');
  const word = words[random(words.length)];
  if (word === undefined) throw new Error('Word index out of range');
  return word;
}

// ── Planning (pure) ───────────────────────────────────────────────

export interface SheetRow {
  username: string;
  password: string;
}

export interface Assignment {
  username: string;
  email: string;
  password: string;
  source: 'sheet' | 'generated';
}

export type PlanIssueKind =
  'unknown_username' | 'duplicate_username' | 'too_short' | 'duplicate_password';

export interface PlanIssue {
  kind: PlanIssueKind;
  detail: string;
}

export interface Plan {
  assignments: Assignment[];
  issues: PlanIssue[];
}

/**
 * Turns spreadsheet rows into the exact set of writes to perform, or a
 * list of reasons not to perform any of them.
 *
 * Any issue at all aborts the whole run — a half-applied password sheet
 * is the worst state to debug, because the admin cannot tell from the
 * spreadsheet which people are already on their new password.
 *
 * Rows are matched to accounts by username; an account absent from the
 * sheet is left completely untouched.
 */
export function planAssignments(
  accounts: AccountSeed[],
  rows: SheetRow[],
  generate: () => string = generateMemorablePassword,
): Plan {
  const byUsername = new Map(accounts.map((a) => [a.username, a]));
  const assignments: Assignment[] = [];
  const issues: PlanIssue[] = [];
  const seenUsernames = new Set<string>();

  for (const row of rows) {
    const username = row.username.trim();
    const password = row.password.trim();

    // A row with neither a username nor a password is spreadsheet
    // padding — trailing empty rows are normal in a hand-edited file.
    if (!username && !password) continue;

    if (!username) {
      issues.push({ kind: 'unknown_username', detail: `a password with no username beside it` });
      continue;
    }

    const account = byUsername.get(username);
    if (!account) {
      issues.push({ kind: 'unknown_username', detail: username });
      continue;
    }

    if (seenUsernames.has(username)) {
      issues.push({ kind: 'duplicate_username', detail: username });
      continue;
    }
    seenUsernames.add(username);

    if (!password) {
      assignments.push({
        username,
        email: account.email,
        password: generate(),
        source: 'generated',
      });
      continue;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      issues.push({
        kind: 'too_short',
        detail: `${username} — ${password.length} characters, minimum is ${MIN_PASSWORD_LENGTH}`,
      });
      continue;
    }

    assignments.push({ username, email: account.email, password, source: 'sheet' });
  }

  // Two supervisors sharing a password means either could have submitted
  // the other's marks. assessment_marks is attributable to a named
  // assessor, so this is a correctness problem, not a style preference.
  const usernamesByPassword = new Map<string, string[]>();
  for (const a of assignments) {
    usernamesByPassword.set(a.password, [
      ...(usernamesByPassword.get(a.password) ?? []),
      a.username,
    ]);
  }
  for (const [, sharers] of usernamesByPassword) {
    if (sharers.length > 1) {
      issues.push({ kind: 'duplicate_password', detail: `shared by ${sharers.join(', ')}` });
    }
  }

  return { assignments, issues };
}

// ── Applying ──────────────────────────────────────────────────────

export type AssignStatus = 'assigned' | 'would_assign' | 'not_found' | 'failed';

export interface AssignResult {
  username: string;
  status: AssignStatus;
  password?: string;
  error?: string;
}

export interface ApplyOptions {
  dryRun?: boolean;
}

export async function applyAssignments(
  client: AdminClient,
  assignments: Assignment[],
  options: ApplyOptions = {},
): Promise<AssignResult[]> {
  const { data, error } = await client.lookupIdsByEmail(assignments.map((a) => a.email));

  if (error) {
    return assignments.map((a) => ({
      username: a.username,
      status: 'failed' as const,
      error: `Lookup failed: ${error.message}`,
    }));
  }

  const idByEmail = new Map((data ?? []).map((row) => [row.email, row.id]));
  const results: AssignResult[] = [];

  for (const assignment of assignments) {
    const id = idByEmail.get(assignment.email);
    if (!id) {
      results.push({ username: assignment.username, status: 'not_found' });
      continue;
    }

    if (options.dryRun) {
      results.push({ username: assignment.username, status: 'would_assign' });
      continue;
    }

    // Password FIRST, then clear the flag — the opposite order to
    // reset-passwords.ts, for the same underlying reason. Here the flag
    // write is what makes a password permanent, so clearing it before the
    // password lands would make the account's OLD (exposed) password
    // permanent. Failing this way round leaves the new password working
    // but still forcing a change: an inconvenience, not a hole.
    const passwordResult = await client.setPassword(id, assignment.password);
    if (passwordResult.error) {
      results.push({
        username: assignment.username,
        status: 'failed',
        error: `password: ${passwordResult.error.message}`,
      });
      continue;
    }

    const flagResult = await client.setMustChangePassword(id, false);
    if (flagResult.error) {
      results.push({
        username: assignment.username,
        status: 'failed',
        password: assignment.password,
        error:
          `password WAS set, but must_change_password could not be cleared ` +
          `(${flagResult.error.message}) — this account will still be asked to ` +
          `change it on sign-in. Re-run to finish.`,
      });
      continue;
    }

    results.push({
      username: assignment.username,
      status: 'assigned',
      password: assignment.password,
    });
  }

  return results;
}

// ── Spreadsheet I/O ───────────────────────────────────────────────

/**
 * ExcelJS represents some cells as an object rather than a primitive —
 * hyperlink, rich text, or formula result. See the same helper in
 * import-trainees.ts and MEMORY.md for the real bug this prevented.
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

/** Writes a starter workbook with every real account pre-filled. */
export async function writeTemplate(
  filePath: string,
  accounts: AccountSeed[] = REAL_ACCOUNTS,
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Passwords');

  sheet.addRow([...HEADERS]);
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.columns = [{ width: 26 }, { width: 24 }, { width: 14 }, { width: 24 }];

  for (const a of accounts) sheet.addRow([a.username, a.name, a.role, '']);

  await workbook.xlsx.writeFile(filePath);
}

/**
 * Reads username/password pairs. Columns are located by header name, not
 * position, so an admin who reorders or inserts columns does not silently
 * assign the "Name" column as everyone's password.
 */
export async function parsePasswordSheet(filePath: string): Promise<SheetRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error(`No worksheet found in ${filePath}`);

  let usernameCol = 0;
  let passwordCol = 0;
  let headerRow = 0;

  sheet.eachRow((row, rowNumber) => {
    if (headerRow) return;
    for (let col = 1; col <= (row.cellCount || 0); col++) {
      const value = cell(row, col).toLowerCase();
      if (value === 'username') usernameCol = col;
      if (value === 'password') passwordCol = col;
    }
    if (usernameCol && passwordCol) headerRow = rowNumber;
    else {
      usernameCol = 0;
      passwordCol = 0;
    }
  });

  if (!headerRow) {
    throw new Error(
      `${filePath}: could not find a header row with both a "Username" and a "Password" column. ` +
        `Generate a fresh one with --template=<path>.`,
    );
  }

  const rows: SheetRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRow) return;
    rows.push({ username: cell(row, usernameCol), password: cell(row, passwordCol) });
  });

  return rows;
}

// ── CLI ───────────────────────────────────────────────────────────

export interface ParsedArgs {
  template?: string;
  file?: string;
  dryRun: boolean;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const valueOf = (flag: string): string | undefined => {
    const arg = argv.find((a) => a.startsWith(`${flag}=`));
    const value = arg?.slice(flag.length + 1).trim();
    return value ? value : undefined;
  };
  return {
    template: valueOf('--template'),
    file: valueOf('--file'),
    dryRun: argv.includes('--dry-run'),
  };
}

export const USAGE =
  'Usage:\n' +
  '  --template=<path.xlsx>   write a starter sheet with all usernames pre-filled\n' +
  '  --file=<path.xlsx>       apply the passwords in that sheet\n' +
  '  --dry-run                with --file: report what would change, write nothing';

async function main() {
  const { template, file, dryRun } = parseArgs(process.argv.slice(2));

  if (template) {
    await writeTemplate(template);
    console.log(`Wrote ${template} with ${REAL_ACCOUNTS.length} accounts.`);
    console.log('Type a password beside each person, save, then re-run with --file=<path>.');
    console.log('Leave a Password cell blank to have a memorable one generated for that person.');
    return;
  }

  if (!file) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  const rows = await parsePasswordSheet(file);
  const { assignments, issues } = planAssignments(REAL_ACCOUNTS, rows);

  if (issues.length > 0) {
    console.error(`${file}: ${issues.length} problem(s) — nothing was written.\n`);
    for (const issue of issues) console.error(`  [${issue.kind}] ${issue.detail}`);
    console.error('\nFix the spreadsheet and run again.');
    process.exitCode = 1;
    return;
  }

  if (assignments.length === 0) {
    console.error(`${file}: no rows to apply.`);
    process.exitCode = 1;
    return;
  }

  const env = resolveEnv();
  if (!env) {
    console.error(MISSING_ENV_MESSAGE);
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(env.url, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const generated = assignments.filter((a) => a.source === 'generated').length;
  console.log(
    `${dryRun ? '[DRY RUN] ' : ''}Assigning ${assignments.length} password(s) on ${env.url}` +
      `${generated > 0 ? ` (${generated} generated for blank rows)` : ''}\n`,
  );

  const results = await applyAssignments(createAdminClient(supabase), assignments, { dryRun });

  console.log('Results:');
  for (const r of results)
    console.log(`  [${r.status}] ${r.username}${r.error ? ` — ${r.error}` : ''}`);

  const withPassword = results.filter((r) => r.password);
  if (withPassword.length > 0) {
    console.log('\nPasswords now live (these do NOT expire — keep this list secure):');
    console.log('username | password');
    for (const r of withPassword) console.log(`${r.username} | ${r.password}`);
  }

  const notFound = results.filter((r) => r.status === 'not_found');
  if (notFound.length > 0) {
    console.log(
      `\n${notFound.length} account(s) had no row in public.users — an Auth identity that was\n` +
        'never linked, or a username that no longer exists. Investigate before handing out.',
    );
  }

  if (results.some((r) => r.status === 'failed')) process.exitCode = 1;
}

// Naive `file://${process.argv[1]}` comparison never matches on Windows —
// see MEMORY.md / import-ipt-roster.ts for why pathToFileURL is used here.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
