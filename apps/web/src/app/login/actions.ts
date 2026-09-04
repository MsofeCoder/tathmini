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
    .select('must_change_password')
    .eq('id', data.user.id)
    .single();

  redirect((profile?.must_change_password ?? true) ? '/change-password' : '/home');
}
