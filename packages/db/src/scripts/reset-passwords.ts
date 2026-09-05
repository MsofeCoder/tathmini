/**
 * Resets the one-time password on real accounts that already exist, and
 * re-arms the forced-password-change flag on each.
 *
 * Why this exists: `create-accounts.ts` deliberately SKIPS an account
 * whose e-mail is already registered, so it can never rotate a password
 * — it is a create-only script. The 30 real accounts (13 IPT-round + 17
 * TP-round) were all created with a generated one-time password that was
 * printed to stdout once and never stored. MEMORY.md records that the
 * full password table was pasted into chat twice; the standing guidance
 * there is to treat all of them as exposed and reset before real use.
 * This is that reset.
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL in the environment.
 * That key bypasses RLS entirely and is never something an agent should
 * hold (AGENTS.md) — run this yourself, locally, with your own
 * .env.local, exactly as with create-accounts.ts.
 *
 * Prints a one-time username/password table to stdout ONLY. Never
 * written to a file, never logged anywhere else. Hand these out through
 * a secure channel — every account it touches is left with
 * must_change_password = true, so the password below is a one-time
 * credential, not the person's real one: sign-in sends them straight to
 * /change-password before they can reach anything else.
 *
 * Scope: DEV_ACCOUNTS (test.supervisor) is deliberately NOT included —
 * that account and its TEST ROUTE data are scheduled for deletion, not
 * a reset. Pass --only to narrow further; see main() below.
 */

import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { IPT_ACCOUNTS, type AccountSeed } from '../data/ipt-accounts';
import { TP_ACCOUNTS } from '../data/tp-accounts';
import { generatePassword } from './create-accounts';
import {
  createAdminClient,
  MISSING_ENV_MESSAGE,
  resolveEnv,
  type AdminClient,
} from './admin-client';

/** The 30 real accounts. Dev/test accounts excluded on purpose. */
export const REAL_ACCOUNTS: AccountSeed[] = [...IPT_ACCOUNTS, ...TP_ACCOUNTS];

export type ResetStatus = 'reset' | 'would_reset' | 'not_found' | 'failed';

export interface ResetResult {
  username: string;
  status: ResetStatus;
  password?: string;
  error?: string;
}

export interface ResetOptions {
  /** Resolve and report, but perform no writes. */
  dryRun?: boolean;
}

/**
 * Narrows `accounts` to the given usernames. Throws on a username that
 * matches nothing — a typo in --only must not silently reset a smaller
 * set than the operator believes it is resetting.
 */
export function selectAccounts(accounts: AccountSeed[], only?: string[]): AccountSeed[] {
  if (!only || only.length === 0) return accounts;

  const unknown = only.filter((u) => !accounts.some((a) => a.username === u));
  if (unknown.length > 0) {
    throw new Error(`Unknown username(s): ${unknown.join(', ')}`);
  }

  const wanted = new Set(only);
  return accounts.filter((a) => wanted.has(a.username));
}

export async function resetPasswords(
  client: AdminClient,
  accounts: AccountSeed[] = REAL_ACCOUNTS,
  options: ResetOptions = {},
): Promise<ResetResult[]> {
  const { data, error } = await client.lookupIdsByEmail(accounts.map((a) => a.email));

  if (error) {
    // A failed lookup is a failure of the whole run, not of one account —
    // report it against every account rather than quietly resetting none.
    return accounts.map((a) => ({
      username: a.username,
      status: 'failed' as const,
      error: `Lookup failed: ${error.message}`,
    }));
  }

  const idByEmail = new Map((data ?? []).map((row) => [row.email, row.id]));
  const results: ResetResult[] = [];

  for (const account of accounts) {
    const id = idByEmail.get(account.email);
    if (!id) {
      results.push({ username: account.username, status: 'not_found' });
      continue;
    }

    if (options.dryRun) {
      results.push({ username: account.username, status: 'would_reset' });
      continue;
    }

    // Flag first, password second, deliberately. If the flag write
    // succeeds and the password write then fails, the account is left
    // reachable only by its OLD password AND forced to change it on next
    // sign-in — safe, and fixed by re-running. The reverse order risks
    // the opposite: a freshly handed-out password whose holder is never
    // forced to change it, which is the exact hole this run exists to
    // close.
    const flagResult = await client.setMustChangePassword(id, true);
    if (flagResult.error) {
      results.push({
        username: account.username,
        status: 'failed',
        error: `must_change_password: ${flagResult.error.message}`,
      });
      continue;
    }

    const password = generatePassword();
    const passwordResult = await client.setPassword(id, password);
    if (passwordResult.error) {
      results.push({
        username: account.username,
        status: 'failed',
        error: `password: ${passwordResult.error.message}`,
      });
      continue;
    }

    results.push({ username: account.username, status: 'reset', password });
  }

  return results;
}

export interface ParsedArgs {
  only?: string[];
  dryRun: boolean;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const dryRun = argv.includes('--dry-run');
  const onlyArg = argv.find((a) => a.startsWith('--only='));
  const only = onlyArg
    ?.slice('--only='.length)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return { only: only && only.length > 0 ? only : undefined, dryRun };
}

async function main() {
  const env = resolveEnv();
  if (!env) {
    console.error(MISSING_ENV_MESSAGE);
    process.exitCode = 1;
    return;
  }

  const { only, dryRun } = parseArgs(process.argv.slice(2));

  let accounts: AccountSeed[];
  try {
    accounts = selectAccounts(REAL_ACCOUNTS, only);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(env.url, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const client = createAdminClient(supabase);

  console.log(
    `${dryRun ? '[DRY RUN] ' : ''}Resetting ${accounts.length} account(s) on ${env.url}\n`,
  );

  const results = await resetPasswords(client, accounts, { dryRun });

  console.log('Results:');
  for (const r of results)
    console.log(`  [${r.status}] ${r.username}${r.error ? ` — ${r.error}` : ''}`);

  const reset = results.filter((r) => r.status === 'reset');
  if (reset.length > 0) {
    console.log('\nTemporary passwords (shown once — hand these out securely, then discard):');
    console.log('username | password');
    for (const r of reset) console.log(`${r.username} | ${r.password}`);
    console.log(
      '\nEach holder is forced through /change-password on first sign-in.\n' +
        'Do not paste this table anywhere it will be retained.',
    );
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
