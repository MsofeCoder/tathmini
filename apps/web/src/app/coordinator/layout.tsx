import Link from 'next/link';
import { redirect } from 'next/navigation';
import { signOut } from '@/app/home/actions';
import { adminAccess, roleLabel } from '@/lib/admin/access';
import { createClient } from '@/lib/supabase/server';

/**
 * The Coordinator's dashboard — oversight, not administration.
 *
 * Separate from `/admin` on purpose. The console is organised around DOING
 * things: correct this trainee, reassign that slot, remove the test rows. The
 * Coordinator's job is the opposite — see how the assessment is going across
 * fourteen routes and twenty-nine assessors, weekly, and act by talking to
 * people rather than by editing rows. Reading a page built for editing means
 * scanning past a dozen controls that are all disabled.
 *
 * There is not one write control anywhere under this route. That is not a UI
 * choice: no RLS policy in the database grants `coordinator` an INSERT or
 * UPDATE on anything except generating a report, so even a forged request from
 * this session would be refused by Postgres.
 *
 * A Super Administrator may open it too, and should — it is how they see what
 * the Coordinator sees before promising them anything.
 */
export default async function CoordinatorLayout({ children }: { children: React.ReactNode }) {
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
    // Deactivated accounts go to sign-in; a supervisor belongs on their route
    // list. Neither path leads back here, so nothing bounces.
    if (profile.active === false) redirect('/login');
    redirect('/home');
  }
  if (profile.must_change_password) redirect('/change-password');

  const isAdmin = access === 'write';

  return (
    <div className="min-h-dvh bg-[#eceff0]">
      <header className="border-b border-[#e1e9e6] bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-teal-mid text-[11px] font-extrabold tracking-[0.7px]">
              MOROGORO VOCATIONAL TEACHERS TRAINING COLLEGE
            </p>
            <p className="text-[17px] font-bold tracking-[-0.2px] text-[#14232e]">
              Assessment overview
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[13px] font-bold text-[#14232e]">{profile.name}</p>
              <p className="text-[11.5px] text-[#5b6b78]">
                {isAdmin
                  ? `${roleLabel(profile.role)} · viewing as Coordinator`
                  : roleLabel(profile.role)}
              </p>
            </div>
            <form action={signOut}>
              <button
                type="submit"
                className="focus:outline-accent min-h-[40px] rounded-xl border border-[#d8b4a8] bg-white px-3 text-[13px] font-semibold text-[#8a3a2a] focus:outline focus:outline-[3px] focus:outline-offset-2"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>

        {isAdmin ? (
          <div className="mx-auto max-w-6xl px-4 pb-2.5">
            <Link
              href="/admin"
              className="text-teal-mid focus:outline-accent text-[12.5px] font-semibold underline focus:outline focus:outline-[3px] focus:outline-offset-2"
            >
              ← Back to the administration console
            </Link>
          </div>
        ) : null}
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-5">{children}</main>

      <footer className="mx-auto max-w-6xl px-4 pb-8">
        <p className="text-[11.5px] leading-relaxed text-[#5f6f7c]">
          Everything on this page is read-only. Totals, grades and the Competent verdict are
          computed in the database from both assessors&rsquo; submitted marks — nothing here
          recalculates them, and nothing here can change one.
        </p>
      </footer>
    </div>
  );
}
