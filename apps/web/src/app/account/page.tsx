import { redirect } from 'next/navigation';
import { signOut } from '@/app/home/actions';
import { createClient } from '@/lib/supabase/server';

const ROLE_LABELS: Record<string, string> = {
  supervisor: 'Supervisor',
  coordinator: 'Coordinator',
  super_admin: 'Super Administrator',
};

/**
 * The prototype's "Account" tab. For now it is who you are and how to sign
 * out — the prototype's fuller settings rows (language, help, about) are
 * Phase 3/4 work and are left out rather than stubbed, so nothing here
 * promises a screen that does not exist.
 *
 * Server-rendered: it needs the session, and signing out is meaningless with
 * no connection anyway. Offline, the service worker serves the offline screen
 * instead — which is the correct answer to "sign me out" in a village.
 */
export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('name, role, email')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) redirect('/login');

  return (
    <main className="min-h-dvh bg-[#eceff0]">
      <div className="border-b border-[#e1e9e6] bg-white p-4">
        <h1 className="text-[21px] font-bold tracking-[-0.2px] text-neutral-900">Account</h1>
      </div>

      <div className="p-4">
        <div className="flex items-center gap-3 rounded-2xl border border-[#e1e9e6] bg-white p-4">
          <div className="text-teal-deep flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-[#ddebe8] text-[16px] font-bold">
            {profile.name
              .split(/\s+/)
              .slice(0, 2)
              .map((part: string) => part[0] ?? '')
              .join('')
              .toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[16px] font-bold text-[#14232e]">{profile.name}</p>
            <p className="mt-0.5 text-[13px] text-[#5b6b78]">
              {ROLE_LABELS[profile.role] ?? profile.role}
            </p>
          </div>
        </div>

        <p className="mt-4 text-[12.5px] leading-relaxed text-[#5f6f7c]">
          Your account is issued by the Administrator. If you need your password changed, or you
          believe someone else knows it, contact the Administrator.
        </p>

        <form action={signOut} className="mt-4">
          <button
            type="submit"
            className="focus:outline-accent flex min-h-[52px] w-full items-center justify-center rounded-xl border border-[#d8b4a8] bg-white text-[15px] font-bold text-[#8a3a2a] focus:outline focus:outline-[3px] focus:outline-offset-2"
          >
            Sign out
          </button>
        </form>

        <p className="mt-3 text-[12.5px] leading-relaxed text-[#5f6f7c]">
          Anything you have marked but not yet sent stays on this phone and is listed under Pending.
          Check it is empty before you sign out.
        </p>
      </div>
    </main>
  );
}
