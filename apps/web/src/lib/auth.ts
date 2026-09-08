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

/**
 * Where a signed-in person belongs, decided once from their role.
 *
 * Sign-in and the forced first password change both have to answer this, and
 * before this function they answered it differently: `signIn()` routed a
 * coordinator to `/coordinator`, while `changePassword()` sent everyone to
 * `/home` regardless. Every account is created with
 * `must_change_password = true`, so the second path is the one a new account
 * takes FIRST — a Coordinator's very first sight of the system was the
 * supervisor field app.
 *
 * That is worse than a wrong link. `/home` is the offline shell, it performs
 * no role check of its own (it is a static document the service worker
 * replays for every url), and `trainees_select` lets a coordinator read the
 * whole cohort — so the shell would have synced all 546 trainees onto their
 * device and offered to mark them, against buttons the database would then
 * refuse. Declaring the destination in one place is what stops the two paths
 * drifting again.
 *
 * A supervisor goes to their route list; a coordinator to the oversight
 * dashboard; a super_admin to the console. An unknown or absent role gets
 * `/home`, which is the safe default: it is the only destination that shows
 * nothing but what its own queries return.
 */
export function landingPathForRole(role: string | null | undefined): string {
  if (role === 'coordinator') return '/coordinator';
  if (role === 'super_admin') return '/admin';
  return '/home';
}
