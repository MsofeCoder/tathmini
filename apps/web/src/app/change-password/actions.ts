'use server';

import { redirect } from 'next/navigation';
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

  redirect('/home');
}
