'use client';

import { useActionState, useState } from 'react';
import { signIn, type SignInState } from './actions';

const initialState: SignInState = { error: null };

// Copy, layout and palette from reference/Tathmini.dc.html's login screen
// (lines 92–128) — the behavioural spec, per AGENTS.md. Palette confirmed
// against AGENTS.md's stated colours: #0d4a43 deep teal, #12665b mid teal,
// #a35c00 accent (focus rings only) — no invented colours.
export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#eceff0] p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm">
        <p className="text-teal-mid text-[12px] font-extrabold tracking-[0.7px]">
          MOROGORO VOCATIONAL TEACHERS TRAINING COLLEGE
        </p>
        <h1 className="mt-2 text-[25px] font-bold tracking-[-0.3px] text-neutral-900">Sign in</h1>
        <p className="mt-2 text-sm leading-relaxed text-[#5b6b78]">
          Sign in once with internet. After that your route and both assessment forms stay on this
          device.
        </p>

        <form action={formAction} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#3c4c58]">
            Username
            <input
              name="username"
              type="text"
              autoCapitalize="none"
              spellCheck={false}
              required
              className="focus:outline-accent min-h-[48px] rounded-[10px] border border-[#ccd7d4] px-3.5 text-[15px] text-neutral-900 focus:outline focus:outline-[3px] focus:outline-offset-1"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#3c4c58]">
            Password
            {/* Reveal exists because these passwords are admin-assigned, not
                chosen: a supervisor is typing a string somebody else generated,
                one-handed, often in bright sun. Getting it wrong twice and
                being locked out in the field is the failure this prevents. */}
            <div className="relative">
              <input
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                autoCapitalize="none"
                spellCheck={false}
                className="focus:outline-accent min-h-[48px] w-full rounded-[10px] border border-[#ccd7d4] py-3 pl-3.5 pr-14 text-[15px] text-neutral-900 focus:outline focus:outline-[3px] focus:outline-offset-1"
              />
              <button
                type="button"
                onClick={() => setShowPassword((shown) => !shown)}
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="focus:outline-accent absolute right-1 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-lg text-[#3c4c58] focus:outline focus:outline-[3px] focus:outline-offset-1"
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </label>

          {state.error ? (
            <div
              role="alert"
              className="rounded-[10px] border border-l-4 border-[#f0d3ca] border-l-[#8a3a2a] bg-[#fdf1ee] px-[13px] py-[11px] text-[13px] leading-relaxed text-[#7a3325]"
            >
              {state.error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="bg-teal-mid focus:outline-accent mt-1 min-h-[52px] rounded-xl text-[16px] font-semibold text-white focus:outline focus:outline-[3px] focus:outline-offset-2 disabled:opacity-70"
          >
            {pending ? 'Signing in…' : 'Sign in'}
          </button>

          {/*
            Static text, not a link. The prototype has `href="#forgot"`, but
            no recovery flow exists or can exist: every account's e-mail is a
            synthetic @tathmini.internal identifier that nothing is ever sent
            to (see packages/db/src/data/ipt-accounts.ts), and passwords are
            admin-assigned. A dead link here is worse than no link — a
            supervisor who has forgotten their password is in the field, and
            needs to be told what to actually do.
          */}
          <p className="flex min-h-[44px] items-center justify-center text-center text-[14px] text-[#5f6f7c]">
            Forgotten your password? Contact the Administrator.
          </p>
        </form>

        <p className="mt-6 text-[12px] leading-relaxed text-[#5f6f7c]">
          Supabase Auth · admin-provisioned credentials. Access is scoped server-side by Postgres
          row-level security.
        </p>
      </div>
    </main>
  );
}

/* Inline so the reveal works with no network and no icon dependency — the
   sign-in screen is the one page a supervisor may open on a dead connection.
   aria-hidden: the button beside them carries the accessible name. */
function EyeIcon() {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.9" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.6 6.1A9.9 9.9 0 0 1 12 5.5c6.4 0 10 6.5 10 6.5a17.6 17.6 0 0 1-3.4 4.2M6.2 7.9A17.5 17.5 0 0 0 2 12s3.6 6.5 10 6.5a9.8 9.8 0 0 0 3.9-.8" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m3 3 18 18" />
    </svg>
  );
}
