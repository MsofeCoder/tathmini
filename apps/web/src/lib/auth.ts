/**
 * Every account (30 real, plus dev/test ones — see packages/db/src/data/)
 * uses a synthetic Supabase Auth identity: the username the person
 * actually types, plus @tathmini.internal. Never a real inbox — see
 * packages/db/src/data/ipt-accounts.ts and MEMORY.md.
 */
export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@tathmini.internal`;
}

/** The prototype's exact wrong-credentials copy (reference/Tathmini.dc.html) — do not paraphrase. */
export const INVALID_CREDENTIALS_MESSAGE =
  'That username and password do not match an account issued by the Administrator.';
