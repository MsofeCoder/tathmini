import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PASSWORD_WORDS } from '../data/password-words';
import type { AdminClient } from './admin-client';
import {
  applyAssignments,
  generateMemorablePassword,
  MIN_PASSWORD_LENGTH,
  parseArgs,
  parsePasswordSheet,
  planAssignments,
  writeTemplate,
  type Assignment,
} from './assign-passwords';
import { REAL_ACCOUNTS } from './reset-passwords';

function okClient(overrides: Partial<AdminClient> = {}): AdminClient {
  return {
    lookupIdsByEmail: vi.fn(async (emails: string[]) => ({
      data: emails.map((email) => ({ id: `id-${email}`, email })),
      error: null,
    })),
    setPassword: vi.fn(async () => ({ error: null })),
    setMustChangePassword: vi.fn(async () => ({ error: null })),
    ...overrides,
  };
}

const [FIRST, SECOND] = REAL_ACCOUNTS;
if (!FIRST || !SECOND) throw new Error('REAL_ACCOUNTS is unexpectedly short');
// Re-bound as non-optional consts: TS does not carry the guard above
// into the closures below.
const ACCOUNT_A = FIRST;
const ACCOUNT_B = SECOND;

function assignment(overrides: Partial<Assignment> = {}): Assignment {
  return {
    username: ACCOUNT_A.username,
    email: ACCOUNT_A.email,
    password: 'chosen-password',
    source: 'sheet',
    ...overrides,
  };
}

describe('PASSWORD_WORDS', () => {
  it('is large enough for the keyspace the generator documents', () => {
    expect(PASSWORD_WORDS.length).toBeGreaterThanOrEqual(160);
  });

  it('has no duplicates — a repeated word silently shrinks the keyspace', () => {
    expect(new Set(PASSWORD_WORDS).size).toBe(PASSWORD_WORDS.length);
  });

  it('is all lowercase ASCII letters, so it can be dictated and typed without ambiguity', () => {
    for (const word of PASSWORD_WORDS) expect(word).toMatch(/^[a-z]{3,9}$/);
  });
});

describe('generateMemorablePassword', () => {
  it('produces word-word-dddd', () => {
    expect(generateMemorablePassword()).toMatch(/^[a-z]+-[a-z]+-\d{4}$/);
  });

  it('always clears the minimum length', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateMemorablePassword().length).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH);
    }
  });

  it('pads the numeric part so it is always four digits', () => {
    // randomInt(max) returns [0, max), so the fake must respect `max`.
    const password = generateMemorablePassword(['simba', 'moto'], (max) => (max === 10000 ? 7 : 1));
    expect(password).toBe('moto-moto-0007');
  });

  it('throws rather than emitting the text "undefined" into a live password', () => {
    expect(() => generateMemorablePassword(['simba'], () => 99)).toThrow(/out of range/);
    expect(() => generateMemorablePassword([], () => 0)).toThrow(/empty/);
  });

  it('does not repeat across calls', () => {
    const generated = new Set(Array.from({ length: 50 }, () => generateMemorablePassword()));
    expect(generated.size).toBeGreaterThan(45);
  });
});

describe('planAssignments', () => {
  it('takes the password from the sheet when one is given', () => {
    const { assignments, issues } = planAssignments(REAL_ACCOUNTS, [
      { username: ACCOUNT_A.username, password: 'lion-of-mvttc' },
    ]);

    expect(issues).toEqual([]);
    expect(assignments).toEqual([
      {
        username: ACCOUNT_A.username,
        email: ACCOUNT_A.email,
        password: 'lion-of-mvttc',
        source: 'sheet',
      },
    ]);
  });

  it('generates a password for a blank cell rather than skipping the row', () => {
    const { assignments, issues } = planAssignments(
      REAL_ACCOUNTS,
      [{ username: ACCOUNT_A.username, password: '   ' }],
      () => 'simba-moto-4821',
    );

    expect(issues).toEqual([]);
    expect(assignments[0]?.password).toBe('simba-moto-4821');
    expect(assignments[0]?.source).toBe('generated');
  });

  it('leaves an account that is absent from the sheet completely untouched', () => {
    const { assignments } = planAssignments(REAL_ACCOUNTS, [
      { username: ACCOUNT_B.username, password: 'a-good-password' },
    ]);

    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.username).toBe(ACCOUNT_B.username);
  });

  it('ignores trailing blank rows, which every hand-edited sheet has', () => {
    const { assignments, issues } = planAssignments(REAL_ACCOUNTS, [
      { username: ACCOUNT_A.username, password: 'a-good-password' },
      { username: '', password: '' },
      { username: '   ', password: '  ' },
    ]);

    expect(issues).toEqual([]);
    expect(assignments).toHaveLength(1);
  });

  it('rejects a username that is not a real account', () => {
    const { issues } = planAssignments(REAL_ACCOUNTS, [
      { username: 'nobody.here', password: 'a-good-password' },
    ]);

    expect(issues).toEqual([{ kind: 'unknown_username', detail: 'nobody.here' }]);
  });

  it('rejects a password with no username beside it', () => {
    const { issues } = planAssignments(REAL_ACCOUNTS, [
      { username: '', password: 'orphaned-password' },
    ]);

    expect(issues[0]?.kind).toBe('unknown_username');
  });

  it('rejects the same username appearing twice', () => {
    const { issues } = planAssignments(REAL_ACCOUNTS, [
      { username: ACCOUNT_A.username, password: 'first-password' },
      { username: ACCOUNT_A.username, password: 'second-password' },
    ]);

    expect(issues).toEqual([{ kind: 'duplicate_username', detail: ACCOUNT_A.username }]);
  });

  it('rejects a password shorter than the in-app minimum', () => {
    const { issues } = planAssignments(REAL_ACCOUNTS, [
      { username: ACCOUNT_A.username, password: 'short' },
    ]);

    expect(issues[0]?.kind).toBe('too_short');
    expect(issues[0]?.detail).toContain(ACCOUNT_A.username);
  });

  it('rejects two accounts sharing a password — marks must stay attributable', () => {
    const { issues } = planAssignments(REAL_ACCOUNTS, [
      { username: ACCOUNT_A.username, password: 'same-password-here' },
      { username: ACCOUNT_B.username, password: 'same-password-here' },
    ]);

    const duplicate = issues.find((i) => i.kind === 'duplicate_password');
    expect(duplicate?.detail).toContain(ACCOUNT_A.username);
    expect(duplicate?.detail).toContain(ACCOUNT_B.username);
  });

  it('trims whitespace an admin leaves around a username', () => {
    const { assignments, issues } = planAssignments(REAL_ACCOUNTS, [
      { username: `  ${ACCOUNT_A.username}  `, password: 'a-good-password' },
    ]);

    expect(issues).toEqual([]);
    expect(assignments[0]?.username).toBe(ACCOUNT_A.username);
  });
});

describe('applyAssignments', () => {
  it('sets the password and clears must_change_password, in that order', async () => {
    const calls: string[] = [];
    const client = okClient({
      setPassword: vi.fn(async () => {
        calls.push('password');
        return { error: null };
      }),
      setMustChangePassword: vi.fn(async () => {
        calls.push('flag');
        return { error: null };
      }),
    });

    const results = await applyAssignments(client, [assignment()]);

    expect(calls).toEqual(['password', 'flag']);
    // false, not true — an assigned password is permanent by design.
    expect(client.setMustChangePassword).toHaveBeenCalledWith(expect.any(String), false);
    expect(results[0]?.status).toBe('assigned');
    expect(results[0]?.password).toBe('chosen-password');
  });

  it('does not clear the flag when the password write fails', async () => {
    const client = okClient({
      setPassword: vi.fn(async () => ({ error: { message: 'weak password' } })),
    });

    const results = await applyAssignments(client, [assignment()]);

    expect(results[0]?.status).toBe('failed');
    expect(results[0]?.error).toContain('weak password');
    expect(client.setMustChangePassword).not.toHaveBeenCalled();
  });

  it('reports a set password whose flag write failed, so the admin knows it is live', async () => {
    const client = okClient({
      setMustChangePassword: vi.fn(async () => ({ error: { message: 'permission denied' } })),
    });

    const results = await applyAssignments(client, [assignment()]);

    expect(results[0]?.status).toBe('failed');
    expect(results[0]?.password).toBe('chosen-password');
    expect(results[0]?.error).toContain('WAS set');
  });

  it('marks an account with no users row not_found, and writes nothing for it', async () => {
    const client = okClient({ lookupIdsByEmail: vi.fn(async () => ({ data: [], error: null })) });

    const results = await applyAssignments(client, [assignment()]);

    expect(results[0]?.status).toBe('not_found');
    expect(client.setPassword).not.toHaveBeenCalled();
  });

  it('fails every account, and writes nothing, when the lookup itself fails', async () => {
    const client = okClient({
      lookupIdsByEmail: vi.fn(async () => ({ data: null, error: { message: 'no connection' } })),
    });

    const results = await applyAssignments(client, [
      assignment(),
      assignment({ username: ACCOUNT_B.username, email: ACCOUNT_B.email, password: 'another-one' }),
    ]);

    expect(results.every((r) => r.status === 'failed')).toBe(true);
    expect(client.setPassword).not.toHaveBeenCalled();
  });

  it('writes nothing in a dry run, and reveals no password', async () => {
    const client = okClient();

    const results = await applyAssignments(client, [assignment()], { dryRun: true });

    expect(results[0]?.status).toBe('would_assign');
    expect(results[0]?.password).toBeUndefined();
    expect(client.setPassword).not.toHaveBeenCalled();
    expect(client.setMustChangePassword).not.toHaveBeenCalled();
  });
});

describe('parseArgs', () => {
  it('reads --template, --file and --dry-run', () => {
    expect(parseArgs(['--file=p.xlsx', '--dry-run'])).toEqual({
      template: undefined,
      file: 'p.xlsx',
      dryRun: true,
    });
    expect(parseArgs(['--template=t.xlsx']).template).toBe('t.xlsx');
  });

  it('treats an empty value as absent, so --file= does not become the file ""', () => {
    expect(parseArgs(['--file=']).file).toBeUndefined();
  });

  it('handles a path containing spaces', () => {
    expect(parseArgs(['--file=C:\\My Files\\passwords.xlsx']).file).toBe(
      'C:\\My Files\\passwords.xlsx',
    );
  });
});

describe('template round-trip', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tathmini-passwords-'));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes a sheet every real account appears in, and reads it back', async () => {
    const file = join(dir, 'template.xlsx');
    await writeTemplate(file);

    const rows = await parsePasswordSheet(file);

    expect(rows).toHaveLength(REAL_ACCOUNTS.length);
    expect(rows.map((r) => r.username)).toEqual(REAL_ACCOUNTS.map((a) => a.username));
    expect(rows.every((r) => r.password === '')).toBe(true);
  });

  it('plans a full run of generated passwords from an untouched template', async () => {
    const file = join(dir, 'untouched.xlsx');
    await writeTemplate(file);

    const { assignments, issues } = planAssignments(REAL_ACCOUNTS, await parsePasswordSheet(file));

    expect(issues).toEqual([]);
    expect(assignments).toHaveLength(REAL_ACCOUNTS.length);
    expect(assignments.every((a) => a.source === 'generated')).toBe(true);
    // The duplicate-password check must not fire on 30 generated ones.
    expect(new Set(assignments.map((a) => a.password)).size).toBe(assignments.length);
  });

  it('locates columns by header name, not position', async () => {
    const file = join(dir, 'reordered.xlsx');
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Passwords');
    sheet.addRow(['Password', 'Notes', 'Username']);
    sheet.addRow(['a-good-password', 'ignore me', ACCOUNT_A.username]);
    await workbook.xlsx.writeFile(file);

    const rows = await parsePasswordSheet(file);

    expect(rows).toEqual([{ username: ACCOUNT_A.username, password: 'a-good-password' }]);
  });

  it('refuses a sheet with no Password column instead of guessing', async () => {
    const file = join(dir, 'no-password-column.xlsx');
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Passwords');
    sheet.addRow(['Username', 'Name']);
    sheet.addRow([ACCOUNT_A.username, 'Someone']);
    await workbook.xlsx.writeFile(file);

    await expect(parsePasswordSheet(file)).rejects.toThrow(/Username.*Password|Password/);
  });
});
