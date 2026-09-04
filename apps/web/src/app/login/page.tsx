'use client';

import { useActionState } from 'react';
import { signIn, type SignInState } from './actions';

const initialState: SignInState = { error: null };

// Copy, layout and palette from reference/Tathmini.dc.html's login screen
// (lines 92–128) — the behavioural spec, per AGENTS.md. Palette confirmed
// against AGENTS.md's stated colours: #0d4a43 deep teal, #12665b mid teal,
// #a35c00 accent (focus rings only) — no invented colours.
export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, initialState);

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
            <input
              name="password"
              type="password"
              required
              className="focus:outline-accent min-h-[48px] rounded-[10px] border border-[#ccd7d4] px-3.5 text-[15px] text-neutral-900 focus:outline focus:outline-[3px] focus:outline-offset-1"
            />
          </label>

          {state.error ? (
            <div
              role="alert"
              className="rounded-[10px] border border-l-4 border-[#f0d3ca] border-l-[#8a3a2a] bg-[#fdf1ee] px-[13px] py-[11px] text-[13px] leading-relaxed text-[#7a3325]"
            >
              {state.error}
            </div>
          ) : null}

          <div className="rounded-[10px] bg-[#e8f1ef] p-3.5">
            <p className="text-teal-deep text-[12px] font-extrabold tracking-[0.7px]">
              ACCOUNTS ARE ISSUED BY THE ADMINISTRATOR
            </p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#3c4c58]">
              Your username is <strong>firstname.lastname</strong>, and your password is set for you
              by the Administrator. There is no self-registration.
            </p>
            <ul className="mt-2 space-y-1 text-[12.5px] leading-relaxed text-[#3c4c58]">
              <li>
                <strong>Supervisor</strong> — assesses trainees in the field. Almost all daily use.
              </li>
              <li>
                <strong>Coordinator</strong> — sees the whole dashboard, read-only, and downloads
                the Excel results.
              </li>
              <li>
                <strong>Super Administrator</strong> — maintainer: unlock, override, accounts,
                exports.
              </li>
            </ul>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="bg-teal-mid focus:outline-accent mt-1 min-h-[52px] rounded-xl text-[16px] font-semibold text-white focus:outline focus:outline-[3px] focus:outline-offset-2 disabled:opacity-70"
          >
            {pending ? 'Signing in…' : 'Sign in'}
          </button>

          <a
            href="#"
            className="text-teal-mid flex min-h-[44px] items-center justify-center text-[14px]"
          >
            Forgot password?
          </a>
        </form>

        <p className="mt-6 text-[12px] leading-relaxed text-[#5f6f7c]">
          Supabase Auth · admin-provisioned credentials. Access is scoped server-side by Postgres
          row-level security.
        </p>
      </div>
    </main>
  );
}
