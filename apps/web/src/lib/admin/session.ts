import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { adminAccess, type AdminAccess } from './access';

/**
 * The console's front door, used by every admin page and Server Action.
 *
 * It is a convenience, not the security boundary — every query and write
 * below runs on the signed-in person's own session, so RLS
 * (0001_rls_and_functions.sql) is what actually decides what they can read
 * and change. If this function were deleted, a supervisor pointing a browser
 * at /admin would see a page frame and empty tables, not other people's data.
 * That is the property AGENTS.md rule 1 asks for, and it is why no admin
 * query anywhere in this console uses the service-role key.
 */
export interface AdminSession {
  supabase: SupabaseClient;
  userId: string;
  name: string;
  role: string;
  access: Exclude<AdminAccess, 'deny'>;
  /** True for a Super Administrator; false for the Coordinator's read-only view. */
  canWrite: boolean;
}

export async function requireAdmin(): Promise<AdminSession> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('name, role, active, must_change_password')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) redirect('/login');

  const access = adminAccess(profile);
  if (access === 'deny') {
    // A deactivated account goes to the sign-in screen, not to /home: /home
    // sends a non-supervisor straight back here, and the two would bounce.
    // A supervisor simply belongs on /home.
    if (profile.active === false) redirect('/login');
    redirect('/home');
  }

  if (profile.must_change_password) redirect('/change-password');

  return {
    supabase,
    userId: user.id,
    name: profile.name,
    role: profile.role,
    access,
    canWrite: access === 'write',
  };
}

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * The Server Action equivalent. Returns an error rather than redirecting,
 * because an action's caller is a form that needs something to show.
 *
 * A refusal here is belt to RLS's braces: a coordinator who forged this
 * request would still be stopped by Postgres, since no write policy names
 * the role. The point of checking anyway is the message — "read-only" is
 * more use to the person than a policy violation.
 */
export async function requireAdminWriter(): Promise<
  { ok: true; session: AdminSession } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Your session has expired. Sign in again.' };

  const { data: profile } = await supabase
    .from('users')
    .select('name, role, active, must_change_password')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) return { ok: false, error: 'Your session has expired. Sign in again.' };

  const access = adminAccess(profile);
  if (access !== 'write') {
    return { ok: false, error: 'Your account has read-only access to the administration console.' };
  }

  return {
    ok: true,
    session: {
      supabase,
      userId: user.id,
      name: profile.name,
      role: profile.role,
      access,
      canWrite: true,
    },
  };
}
