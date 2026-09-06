/**
 * Who may open the admin console, and what they may do there.
 *
 * This is a *pure* decision so it can be unit-tested, but it is NOT the
 * security boundary — AGENTS.md rule 1: authorisation is an RLS policy,
 * never a React condition. Every write this console makes goes through the
 * signed-in person's own session, so `users_admin_write`,
 * `trainees_admin_write` and friends (0001_rls_and_functions.sql) decide
 * what actually lands. This function only decides what to *render*: a
 * coordinator seeing a disabled button and a coordinator whose UPDATE is
 * refused by Postgres are both correct, and only the second one matters.
 *
 * Coordinator is read-only by design and by grant: CONTEXT.md gives the role
 * "the whole admin dashboard, read-only", and there is deliberately no write
 * policy anywhere that names it. No coordinator account exists yet (all 31
 * live accounts are supervisor or super_admin), but the role is modelled here
 * rather than left for later, because a read-only viewer is exactly what the
 * College asked for and the RLS to support it already exists.
 */
export type AdminAccess = 'deny' | 'read' | 'write';

export interface AdminAccessInput {
  role: string | null | undefined;
  /**
   * users.active. A deactivated account keeps working until it is checked
   * somewhere — Supabase Auth knows nothing about this column, so a
   * deactivated person's session stays valid unless the app itself refuses
   * it. Checked here and in the sign-in action; see lib/admin/session.ts.
   */
  active: boolean | null | undefined;
}

export function adminAccess({ role, active }: AdminAccessInput): AdminAccess {
  if (active === false) return 'deny';
  if (role === 'super_admin') return 'write';
  if (role === 'coordinator') return 'read';
  return 'deny';
}

export const ROLE_LABELS: Record<string, string> = {
  supervisor: 'Supervisor',
  coordinator: 'Coordinator',
  super_admin: 'Super Administrator',
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

/**
 * The username a person actually types at sign-in, recovered from the
 * synthetic identifier stored in users.email (lib/auth.ts's
 * usernameToEmail() is the other direction). Shown instead of the raw
 * address because "denis.michael@tathmini.internal" is not an inbox and
 * printing it as one has already confused people — that address exists only
 * to satisfy GoTrue.
 */
export function usernameFromEmail(email: string): string {
  return email.replace(/@tathmini\.internal$/i, '');
}
