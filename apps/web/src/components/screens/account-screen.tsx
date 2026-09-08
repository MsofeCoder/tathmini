'use client';

import { signOut } from '@/app/home/actions';
import { useDeviceRows } from '@/lib/local/use-device';
import { useReachability } from '@/lib/local/use-reachable';
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

/**
 * The College's feedback form, hosted on Google Forms.
 *
 * Hard-coded rather than an environment variable, unlike
 * RESULT_COORDINATOR_EMAIL: that one is configuration because the person
 * holding the role changes and a redeploy should not be needed. A form URL is
 * stable for the life of the form, and a missing env var would leave a dead
 * button on a screen nobody checks.
 *
 * Anonymous, bilingual, and it opens outside the app — see the link below.
 */
const FEEDBACK_URL = 'https://forms.gle/qW29pWr6oqEry7oY8';

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
  // The form is on Google's servers, so it is useless with no signal. Rather
  // than open a browser tab that fails, the link says so and stops being a
  // link — the same treatment Submit gets on the marking screen.
  const online = useReachability() === 'online';

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

        <section className="mt-4 rounded-2xl border border-[#e1e9e6] bg-white p-4">
          <h2 className="text-[15px] font-bold text-[#14232e]">Tell us how this is working</h2>
          {/*
            One line, not a paragraph. #48 stripped the explanatory notes off
            the field screens, and that decision stands — but these two facts
            are not explanation, they are the reason somebody answers honestly
            or not at all.
          */}
          <p className="mt-1 text-[13px] leading-relaxed text-[#5b6b78]">
            No name needed. Kiswahili is fine.
          </p>

          {online ? (
            <a
              href={FEEDBACK_URL}
              // Opens outside the app. `noopener` because the form is on
              // another origin and must never get a handle back to this
              // window; `_blank` so a supervisor part-way through the app
              // does not lose where they were.
              target="_blank"
              rel="noopener noreferrer"
              className="text-teal-deep focus:outline-accent mt-3 flex min-h-[52px] w-full items-center justify-center rounded-xl border border-[#bcd4cf] bg-[#eef5f3] text-[15px] font-bold focus:outline focus:outline-[3px] focus:outline-offset-2"
            >
              Send feedback
            </a>
          ) : (
            <p className="mt-3 flex min-h-[52px] w-full items-center justify-center rounded-xl bg-[#fff2d8] px-3 text-center text-[13px] font-semibold leading-snug text-[#6b4400]">
              The feedback form needs a connection. Open this screen again when you have signal.
            </p>
          )}
        </section>

        <form action={signOutAndClearDevice} className="mt-4">
          <button
            type="submit"
            className="focus:outline-accent flex min-h-[52px] w-full items-center justify-center rounded-xl border border-[#d8b4a8] bg-white text-[15px] font-bold text-[#8a3a2a] focus:outline focus:outline-[3px] focus:outline-offset-2"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
