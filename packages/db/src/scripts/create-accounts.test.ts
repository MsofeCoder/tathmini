import { describe, expect, it, vi } from 'vitest';
import { DEV_ACCOUNTS } from '../data/dev-accounts';
import { IPT_ACCOUNTS } from '../data/ipt-accounts';
import { TP_ACCOUNTS } from '../data/tp-accounts';
import {
  ALL_ACCOUNTS,
  createAccounts,
  generatePassword,
  type AdminAuthClient,
} from './create-accounts';

describe('IPT_ACCOUNTS', () => {
  it("has exactly the 13 accounts this round of creation covers (10 IPT route-assessor slots, one of which is Aron Franco's supervisor account, + Adam Msofe's separate TP supervisor account + 2 super_admins)", () => {
    expect(IPT_ACCOUNTS).toHaveLength(13);
  });

  it('has no duplicate usernames', () => {
    const usernames = IPT_ACCOUNTS.map((a) => a.username);
    expect(new Set(usernames).size).toBe(usernames.length);
  });

  it('derives every email as username@tathmini.internal', () => {
    for (const a of IPT_ACCOUNTS) {
      expect(a.email).toBe(`${a.username}@tathmini.internal`);
    }
  });

  it('gives both dual-role people (Aron Franco, Adam Msofe) a super_admin or supervisor account with a .supervisor-suffixed second identity', () => {
    const supervisorDual = IPT_ACCOUNTS.filter((a) => a.username.endsWith('.supervisor'));
    expect(supervisorDual.map((a) => a.username).sort()).toEqual([
      'adam.msofe.supervisor',
      'aron.franco.supervisor',
    ]);
    expect(supervisorDual.every((a) => a.role === 'supervisor')).toBe(true);
  });
});

describe('TP_ACCOUNTS', () => {
  it('has exactly the 17 new accounts this round covers (18 TP assessor slots, one of which — Adam Msofe, Route 6 — already has an account from ipt-accounts.ts)', () => {
    expect(TP_ACCOUNTS).toHaveLength(17);
  });

  it("has no duplicate usernames, and does not re-create Adam Msofe's existing account", () => {
    const usernames = TP_ACCOUNTS.map((a) => a.username);
    expect(new Set(usernames).size).toBe(usernames.length);
    expect(usernames).not.toContain('adam.msofe.supervisor');
  });

  it('derives every email as username@tathmini.internal', () => {
    for (const a of TP_ACCOUNTS) {
      expect(a.email).toBe(`${a.username}@tathmini.internal`);
    }
  });
});

describe('ALL_ACCOUNTS', () => {
  it('combines IPT_ACCOUNTS, TP_ACCOUNTS, and DEV_ACCOUNTS with no username collisions between them', () => {
    expect(ALL_ACCOUNTS).toHaveLength(
      IPT_ACCOUNTS.length + TP_ACCOUNTS.length + DEV_ACCOUNTS.length,
    );
    const usernames = ALL_ACCOUNTS.map((a) => a.username);
    expect(new Set(usernames).size).toBe(usernames.length);
  });
});

describe('generatePassword', () => {
  it('produces a 16-character password', () => {
    expect(generatePassword()).toHaveLength(16);
  });

  it('does not repeat across calls', () => {
    const passwords = new Set(Array.from({ length: 20 }, () => generatePassword()));
    expect(passwords.size).toBe(20);
  });
});

describe('createAccounts', () => {
  it('creates every account and returns its one-time password', async () => {
    const admin: AdminAuthClient = {
      createUser: vi.fn(async ({ email }) => ({
        data: { user: { id: `id-${email}` } },
        error: null,
      })),
    };

    const results = await createAccounts(admin, IPT_ACCOUNTS.slice(0, 2));
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === 'created' && r.password?.length === 16)).toBe(true);
    expect(admin.createUser).toHaveBeenCalledTimes(2);
  });

  it('skips, without failing, an account whose email is already registered', async () => {
    const admin: AdminAuthClient = {
      createUser: vi.fn(async () => ({
        data: { user: null },
        error: { message: 'A user with this email address has already been registered' },
      })),
    };

    const results = await createAccounts(admin, IPT_ACCOUNTS.slice(0, 1));
    expect(results[0]?.status).toBe('skipped_existing');
  });

  it('reports a real failure distinctly from an already-registered skip', async () => {
    const admin: AdminAuthClient = {
      createUser: vi.fn(async () => ({
        data: { user: null },
        error: { message: 'Service unavailable' },
      })),
    };

    const results = await createAccounts(admin, IPT_ACCOUNTS.slice(0, 1));
    expect(results[0]?.status).toBe('failed');
    expect(results[0]?.error).toBe('Service unavailable');
  });
});
