import Link from 'next/link';
import { signOut } from '@/app/home/actions';
import { roleLabel } from '@/lib/admin/access';
import { requireAdmin } from '@/lib/admin/session';
import { AdminNav } from './nav';

/**
 * The administration console (ROADMAP.md Phase 3).
 *
 * Deliberately its own shell rather than a tab inside the supervisor app:
 * the supervisor PWA is a one-handed, offline-first, thumb-reachable phone
 * screen, and this is a desk tool used online with a keyboard. Sharing a
 * layout would compromise both. The supervisor bottom navigation does not
 * appear here — app-chrome.tsx renders it only on the four top-level
 * supervisor paths, so nothing had to change there for this to be true.
 *
 * Not offline-capable, on purpose: none of these screens is any use without
 * the database, they are never opened in the field, and caching an admin's
 * view of every trainee onto a device is exactly the wrong thing to do.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();

  return (
    <div className="min-h-dvh bg-[#eceff0]">
      <header className="border-b border-[#e1e9e6] bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-teal-mid text-[11px] font-extrabold tracking-[0.7px]">
              MOROGORO VOCATIONAL TEACHERS TRAINING COLLEGE
            </p>
            <p className="text-[17px] font-bold tracking-[-0.2px] text-[#14232e]">
              Tathmini administration
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[13px] font-bold text-[#14232e]">{session.name}</p>
              <p className="text-[11.5px] text-[#5b6b78]">
                {roleLabel(session.role)}
                {session.canWrite ? '' : ' · read-only'}
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
        <AdminNav />
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-5">{children}</main>

      <footer className="mx-auto max-w-6xl px-4 pb-8">
        <p className="text-[11.5px] leading-relaxed text-[#5f6f7c]">
          Everything you see here is read through your own account, so the same database policies
          that protect a supervisor’s marks apply to this console. Submitted marks are append-only
          and cannot be edited from any screen.{' '}
          <Link href="/home" className="text-teal-mid font-semibold underline">
            Back to the supervisor app
          </Link>
        </p>
      </footer>
    </div>
  );
}
