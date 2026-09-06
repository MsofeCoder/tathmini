'use server';

import { redirect } from 'next/navigation';
import { INVALID_CREDENTIALS_MESSAGE, usernameToEmail } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export interface SignInState {
  error: string | null;
}

export async function signIn(_prevState: SignInState, formData: FormData): Promise<SignInState> {
  const username = String(formData.get('username') ?? '');
  const password = String(formData.get('password') ?? '');

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });

  if (error || !data.user) {
    return { error: INVALID_CREDENTIALS_MESSAGE };
  }

  const { data: profile } = await supabase
    .from('users')
    .select('must_change_password, active, role')
    .eq('id', data.user.id)
    .single();

  /**
   * A deactivated account. Supabase Auth knows nothing about `users.active`,
   * so the credentials above really do authenticate — this is the check that
   * makes deactivating someone in the admin console mean anything at all.
   * The session is dropped again immediately, and the message deliberately
   * does not distinguish this from a wrong password by more than it must.
   */
  if (profile && profile.active === false) {
    await supabase.auth.signOut();
    return {
      error: 'That account has been deactivated. Contact the Administrator.',
    };
  }

  if (profile?.must_change_password ?? true) redirect('/change-password');
  redirect(profile?.role === 'supervisor' ? '/home' : '/admin');
}
