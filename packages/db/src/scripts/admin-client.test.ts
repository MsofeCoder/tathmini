import { describe, expect, it } from 'vitest';
import { ENV_KEYS, loadEnvFiles } from './admin-client';

describe('loadEnvFiles', () => {
  /** Stands in for process.loadEnvFile: writes `vars` into `env`. */
  function fakeLoader(
    env: Record<string, string | undefined>,
    files: Record<string, Record<string, string>>,
  ) {
    return (path: string) => {
      const vars = files[path];
      if (!vars) throw new Error(`ENOENT: ${path}`);
      Object.assign(env, vars);
    };
  }

  it('loads values from a file when the shell has none', () => {
    const env: Record<string, string | undefined> = {};
    loadEnvFiles(fakeLoader(env, { '.env.local': { SUPABASE_URL: 'from-file' } }), env, [
      '.env.local',
    ]);
    expect(env.SUPABASE_URL).toBe('from-file');
  });

  it('lets a shell value win over a file value', () => {
    const env: Record<string, string | undefined> = { SUPABASE_SERVICE_ROLE_KEY: 'from-shell' };
    loadEnvFiles(
      fakeLoader(env, { '.env.local': { SUPABASE_SERVICE_ROLE_KEY: 'from-file' } }),
      env,
      ['.env.local'],
    );
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe('from-shell');
  });

  it('protects every key it claims to protect', () => {
    const shell = Object.fromEntries(ENV_KEYS.map((k) => [k, `shell-${k}`]));
    const env: Record<string, string | undefined> = { ...shell };
    const files = { '.env': Object.fromEntries(ENV_KEYS.map((k) => [k, `file-${k}`])) };

    loadEnvFiles(fakeLoader(env, files), env, ['.env']);

    for (const key of ENV_KEYS) expect(env[key]).toBe(`shell-${key}`);
  });

  it('ignores a missing file and still applies the ones that exist', () => {
    const env: Record<string, string | undefined> = {};
    loadEnvFiles(fakeLoader(env, { '.env': { SUPABASE_URL: 'from-env' } }), env, [
      '.env',
      '.env.local',
      'packages/db/.env.local',
    ]);
    expect(env.SUPABASE_URL).toBe('from-env');
  });

  it('lets a later file override an earlier one', () => {
    const env: Record<string, string | undefined> = {};
    loadEnvFiles(
      fakeLoader(env, {
        '.env': { SUPABASE_URL: 'from-env' },
        '.env.local': { SUPABASE_URL: 'from-env-local' },
      }),
      env,
      ['.env', '.env.local'],
    );
    expect(env.SUPABASE_URL).toBe('from-env-local');
  });

  it('does not invent a value when neither shell nor file has one', () => {
    const env: Record<string, string | undefined> = {};
    loadEnvFiles(fakeLoader(env, {}), env, ['.env.local']);
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
  });
});
