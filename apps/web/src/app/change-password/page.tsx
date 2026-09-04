import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ChangePasswordForm } from './form';

// No prototype precedent for this screen (confirmed absent from
// reference/Tathmini.dc.html this session) — designed fresh, in
// CONTEXT.md's plain institutional-English register, matching the
// login screen's layout/palette for visual consistency.
export default async function ChangePasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('must_change_password')
    .eq('id', user.id)
    .single();

  // Already changed it (or navigated here directly) — nothing to do.
  if (!profile?.must_change_password) redirect('/home');

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#eceff0] p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm">
        <p className="text-teal-mid text-[12px] font-extrabold tracking-[0.7px]">
          FIRST TIME SIGNING IN
        </p>
        <h1 className="mt-2 text-[25px] font-bold tracking-[-0.3px] text-neutral-900">
          Set a new password
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[#5b6b78]">
          Choose a password only you know. You will use it to sign in from now on.
        </p>

        <ChangePasswordForm />
      </div>
    </main>
  );
}
