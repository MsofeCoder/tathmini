/**
 * Creates the real Supabase Auth accounts listed in
 * packages/db/src/data/ipt-accounts.ts, tp-accounts.ts, and
 * dev-accounts.ts, via the Auth Admin API — the only
 * way to create a real, working login; a raw SQL insert into auth.users
 * would skip GoTrue's own bookkeeping (password hashing, confirmation
 * state) and likely not produce a working account.
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL, from the repo-root
 * .env/.env.local or your shell — see resolveEnv() in admin-client.ts.
 * This key is never something an agent should hold — run this yourself,
 * locally. See MEMORY.md for why account creation went this route
 * instead of any other.
 *
 * This script only creates the Auth identities (auth.users). It does NOT
 * insert the matching packages/db `users` rows, `routes`, `trainees`, or
 * `assignments` — that happens separately once these accounts exist (see
 * MEMORY.md), since it needs the real ids Supabase assigns here.
 *
 * Prints a one-time username/password table to stdout ONLY. Never written
 * to a file, never logged anywhere else. Hand these out through a secure
 * channel — this is a stand-in for ROADMAP.md Phase 1's still-unbuilt
 * "forced password change on first use," not a replacement for it.
 */

import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { MISSING_ENV_MESSAGE, resolveEnv } from './admin-client';
import { DEV_ACCOUNTS } from '../data/dev-accounts';
import { IPT_ACCOUNTS, type AccountSeed } from '../data/ipt-accounts';
import { TP_ACCOUNTS } from '../data/tp-accounts';

export const ALL_ACCOUNTS: AccountSeed[] = [...IPT_ACCOUNTS, ...TP_ACCOUNTS, ...DEV_ACCOUNTS];

export function generatePassword(): string {
  // 16 chars, base64url alphabet — no ambiguous-character concerns since
  // these are typed once by an admin handing them out, not memorized.
  return randomBytes(12).toString('base64url').slice(0, 16);
}

export interface CreateAccountResult {
  username: string;
  status: 'created' | 'skipped_existing' | 'failed';
  password?: string;
  error?: string;
}

export interface AdminAuthClient {
  createUser(attrs: {
    email: string;
    password: string;
    email_confirm: boolean;
    user_metadata: Record<string, string>;
  }): Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }>;
}

function isAlreadyRegistered(message: string): boolean {
  return /already.*(registered|exists)/i.test(message);
}

export async function createAccounts(
  admin: AdminAuthClient,
  accounts: AccountSeed[] = ALL_ACCOUNTS,
): Promise<CreateAccountResult[]> {
  const results: CreateAccountResult[] = [];

  for (const account of accounts) {
    const password = generatePassword();
    const { data, error } = await admin.createUser({
      email: account.email,
      password,
      email_confirm: true,
      user_metadata: { username: account.username, name: account.name },
    });

    if (error) {
      if (isAlreadyRegistered(error.message)) {
        results.push({ username: account.username, status: 'skipped_existing' });
      } else {
        results.push({ username: account.username, status: 'failed', error: error.message });
      }
      continue;
    }

    if (!data.user) {
      results.push({ username: account.username, status: 'failed', error: 'No user returned' });
      continue;
    }

    results.push({ username: account.username, status: 'created', password });
  }

  return results;
}

async function main() {
  const env = resolveEnv();
  if (!env) {
    console.error(MISSING_ENV_MESSAGE);
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(env.url, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const results = await createAccounts(supabase.auth.admin);

  console.log('\nResults:');
  for (const r of results)
    console.log(`  [${r.status}] ${r.username}${r.error ? ` — ${r.error}` : ''}`);

  const created = results.filter((r) => r.status === 'created');
  if (created.length > 0) {
    console.log('\nTemporary passwords (shown once — hand these out securely, then discard):');
    console.log('username | password');
    for (const r of created) console.log(`${r.username} | ${r.password}`);
  }

  if (results.some((r) => r.status === 'failed')) process.exitCode = 1;
}

// Naive `file://${process.argv[1]}` comparison never matches on Windows —
// see MEMORY.md / import-ipt-roster.ts for why pathToFileURL is used here.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
