import { describe, expect, it, vi } from 'vitest';
import { DEV_ACCOUNTS } from '../data/dev-accounts';
import { IPT_ACCOUNTS } from '../data/ipt-accounts';
import { TP_ACCOUNTS } from '../data/tp-accounts';
import type { AdminClient } from './admin-client';
import { parseArgs, REAL_ACCOUNTS, resetPasswords, selectAccounts } from './reset-passwords';

/**
 * A ResetClient whose lookup resolves every given e-mail to a stable
 * fake uid, and whose writes always succeed. Override individual members
 * per test for the failure paths.
 */
function okClient(overrides: Partial<AdminClient> = {}): AdminClient {
  return {
    lookupIdsByEmail: vi.fn(async (emails: string[]) => ({
      data: emails.map((email) => ({ id: `id-${email}`, email })),
      error: null,
    })),
    setMustChangePassword: vi.fn(async () => ({ error: null })),
    setPassword: vi.fn(async () => ({ error: null })),
    ...overrides,
  };
}

describe('REAL_ACCOUNTS', () => {
  it('is the 30 real accounts — both roster rounds, no dev/test account', () => {
    expect(REAL_ACCOUNTS).toHaveLength(30);
    expect(REAL_ACCOUNTS).toHaveLength(IPT_ACCOUNTS.length + TP_ACCOUNTS.length);
    for (const dev of DEV_ACCOUNTS) {
      expect(REAL_ACCOUNTS.map((a) => a.username)).not.toContain(dev.username);
    }
  });

  it('has no duplicate usernames across the two rounds', () => {
    const usernames = REAL_ACCOUNTS.map((a) => a.username);
    expect(new Set(usernames).size).toBe(usernames.length);
  });
});

describe('selectAccounts', () => {
  it('returns every account when no filter is given', () => {
    expect(selectAccounts(REAL_ACCOUNTS)).toHaveLength(30);
    expect(selectAccounts(REAL_ACCOUNTS, [])).toHaveLength(30);
  });

  it('narrows to the named usernames', () => {
    const selected = selectAccounts(REAL_ACCOUNTS, ['msofe.coder', 'adam.msofe.supervisor']);
    expect(selected.map((a) => a.username)).toEqual(['msofe.coder', 'adam.msofe.supervisor']);
  });

  it('throws on an unknown username rather than resetting a smaller set than asked for', () => {
    expect(() => selectAccounts(REAL_ACCOUNTS, ['msofe.coder', 'nobody.here'])).toThrow(
      /nobody\.here/,
    );
  });
});

describe('parseArgs', () => {
  it('defaults to every account and a real (non-dry) run', () => {
    expect(parseArgs([])).toEqual({ only: undefined, dryRun: false });
  });

  it('parses --dry-run', () => {
    expect(parseArgs(['--dry-run']).dryRun).toBe(true);
  });

  it('parses a comma-separated --only, trimming whitespace', () => {
    expect(parseArgs(['--only=msofe.coder, aron.franco']).only).toEqual([
      'msofe.coder',
      'aron.franco',
    ]);
  });

  it('treats an empty --only as no filter', () => {
    expect(parseArgs(['--only=']).only).toBeUndefined();
  });
});

describe('resetPasswords', () => {
  it('resets each account and returns its one-time password', async () => {
    const client = okClient();
    const results = await resetPasswords(client, REAL_ACCOUNTS.slice(0, 2));

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === 'reset' && r.password?.length === 16)).toBe(true);
    expect(client.setPassword).toHaveBeenCalledTimes(2);
  });

  it('gives each account a different password', async () => {
    const results = await resetPasswords(okClient(), REAL_ACCOUNTS.slice(0, 5));
    const passwords = new Set(results.map((r) => r.password));
    expect(passwords.size).toBe(5);
  });

  it('re-arms must_change_password BEFORE rotating the password', async () => {
    const calls: string[] = [];
    const client = okClient({
      setMustChangePassword: vi.fn(async () => {
        calls.push('flag');
        return { error: null };
      }),
      setPassword: vi.fn(async () => {
        calls.push('password');
        return { error: null };
      }),
    });

    await resetPasswords(client, REAL_ACCOUNTS.slice(0, 1));
    expect(calls).toEqual(['flag', 'password']);
    // true, not false — this script issues one-time credentials.
    expect(client.setMustChangePassword).toHaveBeenCalledWith(expect.any(String), true);
  });

  it('does not rotate the password when the flag write fails', async () => {
    const client = okClient({
      setMustChangePassword: vi.fn(async () => ({ error: { message: 'permission denied' } })),
    });

    const results = await resetPasswords(client, REAL_ACCOUNTS.slice(0, 1));
    expect(results[0]?.status).toBe('failed');
    expect(results[0]?.error).toContain('permission denied');
    expect(results[0]?.password).toBeUndefined();
    expect(client.setPassword).not.toHaveBeenCalled();
  });

  it('reports a failed password write without leaking a password it never set', async () => {
    const client = okClient({
      setPassword: vi.fn(async () => ({ error: { message: 'Service unavailable' } })),
    });

    const results = await resetPasswords(client, REAL_ACCOUNTS.slice(0, 1));
    expect(results[0]?.status).toBe('failed');
    expect(results[0]?.error).toContain('Service unavailable');
    expect(results[0]?.password).toBeUndefined();
  });

  it('marks an account with no users row not_found, and writes nothing for it', async () => {
    const client = okClient({
      lookupIdsByEmail: vi.fn(async () => ({ data: [], error: null })),
    });

    const results = await resetPasswords(client, REAL_ACCOUNTS.slice(0, 1));
    expect(results[0]?.status).toBe('not_found');
    expect(client.setMustChangePassword).not.toHaveBeenCalled();
    expect(client.setPassword).not.toHaveBeenCalled();
  });

  it('fails every account, and writes nothing, when the lookup itself fails', async () => {
    const client = okClient({
      lookupIdsByEmail: vi.fn(async () => ({ data: null, error: { message: 'no connection' } })),
    });

    const results = await resetPasswords(client, REAL_ACCOUNTS.slice(0, 3));
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.status === 'failed')).toBe(true);
    expect(results[0]?.error).toContain('no connection');
    expect(client.setPassword).not.toHaveBeenCalled();
  });

  it('writes nothing in a dry run, but still reports what it would touch', async () => {
    const client = okClient();
    const results = await resetPasswords(client, REAL_ACCOUNTS.slice(0, 3), { dryRun: true });

    expect(results.every((r) => r.status === 'would_reset')).toBe(true);
    expect(results.every((r) => r.password === undefined)).toBe(true);
    expect(client.setMustChangePassword).not.toHaveBeenCalled();
    expect(client.setPassword).not.toHaveBeenCalled();
  });

  it('still reports not_found in a dry run, so a missing account is caught before the real run', async () => {
    const [first, second] = REAL_ACCOUNTS;
    if (!first || !second) throw new Error('REAL_ACCOUNTS is unexpectedly short');

    const client = okClient({
      lookupIdsByEmail: vi.fn(async () => ({
        data: [{ id: 'id-1', email: first.email }],
        error: null,
      })),
    });

    const results = await resetPasswords(client, [first, second], { dryRun: true });
    expect(results.map((r) => r.status)).toEqual(['would_reset', 'not_found']);
  });
});
