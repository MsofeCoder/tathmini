'use client';

import { signOut } from '@/app/home/actions';
import { useDeviceRows } from '@/lib/local/use-device';
import { clearReplicas } from '@/lib/sync/apply';
import { initials } from '@/lib/trainees';

/**
 * Sign out of the server AND off this phone.
 *
 * The device's copy of a route is not innocuous — it is a list of trainees
 * with their contact details — and these phones are shared between tutors.
 * Clearing runs first, so a sign-out that fails at the network still leaves
 * nothing behind for the next person.
 *
 * Only the replicas go. Queued marks stay, because they exist nowhere else.
 */
async function signOutAndClearDevice() {
  await clearReplicas();
  await signOut();
}

const ROLE_LABELS: Record<string, string> = {
  supervisor: 'Supervisor',
  coordinator: 'Coordinator',
  super_admin: 'Super Administrator',
};

/**
 * The prototype's "Account" tab — who you are and how to sign out.
 *
 * Reads the device rather than the server, like every other screen. Signing
 * out still needs the network (it revokes the session), and that is correct:
 * the button posts a Server Action and fails visibly with no connection,
 * rather than pretending to sign somebody out while the session cookie
 * survives on the phone.
 *
 * The previous version selected `users.email` and never rendered it, so
 * nothing is lost by not carrying it to the device — and that column is the
 * synthetic `firstname.lastname@tathmini.internal` sign-in identifier
 * anyway, not a mailbox (see CONTEXT.md), so showing it would only ever have
 * confused somebody into e-mailing it.
 */
export function AccountScreen() {
  const rows = useDeviceRows();
  const session = rows?.session ?? null;

  return (
    <main className="min-h-dvh bg-[#eceff0]">
      <div className="border-b border-[#e1e9e6] bg-white p-4">
        <h1 className="text-[21px] font-bold tracking-[-0.2px] text-neutral-900">Account</h1>
      </div>

      <div className="p-4">
        <div className="flex items-center gap-3 rounded-2xl border border-[#e1e9e6] bg-white p-4">
          <div className="text-teal-deep flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-[#ddebe8] text-[16px] font-bold">
            {initials(session?.name ?? '')}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[16px] font-bold text-[#14232e]">{session?.name ?? '—'}</p>
            <p className="mt-0.5 text-[13px] text-[#5b6b78]">
              {session ? (ROLE_LABELS[session.role] ?? session.role) : ''}
            </p>
          </div>
        </div>

        <p className="mt-4 text-[12.5px] leading-relaxed text-[#5f6f7c]">
          Your account is issued by the Administrator. If you need your password changed, or you
          believe someone else knows it, contact the Administrator.
        </p>

        <form action={signOutAndClearDevice} className="mt-4">
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
