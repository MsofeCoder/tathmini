'use server';

import { redirect } from 'next/navigation';
import { landingPathForRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export interface ChangePasswordState {
  error: string | null;
}

export async function changePassword(
  _prevState: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters.' };
  }
  if (password !== confirm) {
    return { error: 'Passwords do not match.' };
  }

  const supabase = await createClient();

  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) {
    return { error: updateError.message };
  }

  // Clears must_change_password for the caller's own row only — see
  // clear_own_password_change_flag() in migrations/0009 and MEMORY.md
  // for why this is an RPC rather than a direct UPDATE.
  const { error: rpcError } = await supabase.rpc('clear_own_password_change_flag');
  if (rpcError) {
    return { error: rpcError.message };
  }

  /**
   * Land where the role belongs, not on /home.
   *
   * Every account is provisioned with must_change_password = true, so this
   * is the FIRST screen a new account reaches — before sign-in's own routing
   * ever runs. Sending a Coordinator or an Administrator to /home put them
   * in the supervisor field app on their first use of the system; /home does
   * no role check of its own, and a coordinator can read every trainee, so
   * the shell would have synced the whole cohort onto their device.
   *
   * The role is read after the password write, not before, so a failed
   * update costs nothing. If the row cannot be read, landingPathForRole()
   * falls back to /home, which is where a supervisor — every account but
   * three — belongs anyway.
   */
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase.from('users').select('role').eq('id', user.id).maybeSingle()
    : { data: null };

  redirect(landingPathForRole(profile?.role));
}
