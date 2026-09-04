'use client';

import { useActionState } from 'react';
import { changePassword, type ChangePasswordState } from './actions';

const initialState: ChangePasswordState = { error: null };

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePassword, initialState);

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#3c4c58]">
        New password
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoFocus
          className="focus:outline-accent min-h-[48px] rounded-[10px] border border-[#ccd7d4] px-3.5 text-[15px] text-neutral-900 focus:outline focus:outline-[3px] focus:outline-offset-1"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#3c4c58]">
        Confirm new password
        <input
          name="confirm"
          type="password"
          required
          minLength={8}
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

      <button
        type="submit"
        disabled={pending}
        className="bg-teal-mid focus:outline-accent mt-1 min-h-[52px] rounded-xl text-[16px] font-semibold text-white focus:outline focus:outline-[3px] focus:outline-offset-2 disabled:opacity-70"
      >
        {pending ? 'Saving…' : 'Save password'}
      </button>
    </form>
  );
}
