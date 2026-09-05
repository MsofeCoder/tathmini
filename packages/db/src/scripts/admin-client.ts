/**
 * Shared plumbing for the two admin scripts that hold the service-role
 * key — `reset-passwords.ts` (rotate to one-time credentials) and
 * `assign-passwords.ts` (apply the admin's own chosen passwords from a
 * spreadsheet).
 *
 * Both need the same three operations and the same environment handling,
 * and both are operating on real assessors' credentials, so they share
 * one tested code path rather than two lookalike ones that can drift.
 *
 * SUPABASE_SERVICE_ROLE_KEY bypasses RLS entirely. Never sent to the
 * client, never held by an agent (AGENTS.md) — these scripts are run by
 * a human, locally.
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface AdminError {
  message: string;
}

/**
 * The three operations the password scripts need. Narrow on purpose so
 * the logic above it can be tested with no network and no service-role
 * key — the same seam as AdminAuthClient in create-accounts.ts.
 */
export interface AdminClient {
  /** Resolves e-mails to `users` rows. Service role, so RLS does not apply. */
  lookupIdsByEmail(
    emails: string[],
  ): Promise<{ data: { id: string; email: string }[] | null; error: AdminError | null }>;
  /** Auth Admin API updateUserById — the actual password write. */
  setPassword(id: string, password: string): Promise<{ error: AdminError | null }>;
  /** Sets users.must_change_password. */
  setMustChangePassword(id: string, value: boolean): Promise<{ error: AdminError | null }>;
}

export function createAdminClient(supabase: SupabaseClient): AdminClient {
  return {
    async lookupIdsByEmail(emails) {
      const { data, error } = await supabase.from('users').select('id, email').in('email', emails);
      return { data, error: error ? { message: error.message } : null };
    },
    async setPassword(id, password) {
      const { error } = await supabase.auth.admin.updateUserById(id, { password });
      return { error: error ? { message: error.message } : null };
    },
    async setMustChangePassword(id, value) {
      const { error } = await supabase
        .from('users')
        .update({ must_change_password: value })
        .eq('id', id);
      return { error: error ? { message: error.message } : null };
    },
  };
}

// ── Environment ───────────────────────────────────────────────────

/** The env vars these scripts read. */
export const ENV_KEYS = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;

/**
 * Loads env files into `env`, with **shell values always winning** over
 * file values.
 *
 * Nothing in this repo pulls in dotenv, and `tsx` does not read env files
 * on its own — so before this existed, `.env.local` was documented as the
 * place to put the service-role key while being read by absolutely
 * nothing. Setting the vars inline in the shell stays perfectly valid
 * (and keeps the key off disk entirely), which is why a shell value is
 * never clobbered by a file.
 *
 * A missing or unreadable file is not an error: every path is optional,
 * and the caller reports the only failure that actually matters — the
 * vars still being unset afterwards.
 */
export function loadEnvFiles(
  loadEnvFile: (path: string) => void,
  env: Record<string, string | undefined>,
  paths: string[],
): void {
  const fromShell = ENV_KEYS.filter((k) => env[k]).map((k) => [k, env[k]] as const);

  for (const path of paths) {
    try {
      loadEnvFile(path);
    } catch {
      // Absent or unreadable — expected for most of these paths.
    }
  }

  for (const [key, value] of fromShell) env[key] = value;
}

export const MISSING_ENV_MESSAGE =
  'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY — either in the repo-root\n' +
  '.env.local (gitignored), or inline in your shell for one run.\n' +
  'Both come from Supabase > Project Settings > API ("service_role", not the anon key).';

/**
 * Loads the env files, then returns the two required values — or null if
 * either is still unset after that.
 */
export function resolveEnv(): { url: string; serviceRoleKey: string } | null {
  // process.loadEnvFile is Node 20.12+/22+; typed defensively because
  // this package pulls @types/node in transitively, not directly.
  const loader = (process as unknown as { loadEnvFile?: (path: string) => void }).loadEnvFile;
  if (typeof loader === 'function') {
    // packages/db/src/scripts/ -> repo root is four levels up.
    const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
    loadEnvFiles(loader.bind(process), process.env, [
      resolve(repoRoot, '.env'),
      resolve(repoRoot, '.env.local'),
      resolve(repoRoot, 'packages/db/.env.local'),
    ]);
  }

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
}
