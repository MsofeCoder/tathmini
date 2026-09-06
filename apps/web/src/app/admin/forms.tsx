'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionResult } from '@/lib/admin/session';

/**
 * The console's three interactive pieces. Client components because a form
 * that reports what happened needs state; everything else in /admin is
 * server-rendered and ships no JavaScript.
 */

export function SubmitButton({
  children,
  tone = 'primary',
  disabled,
}: {
  children: React.ReactNode;
  tone?: 'primary' | 'quiet' | 'destructive';
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const palette = {
    primary: 'border-[#0d4a43] bg-[#0d4a43] text-white',
    quiet: 'border-[#ccd7d4] bg-white text-[#14232e]',
    destructive: 'border-[#d8b4a8] bg-white text-[#8a3a2a]',
  }[tone];

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className={`focus:outline-accent min-h-[44px] whitespace-nowrap rounded-xl border px-3.5 text-[13px] font-bold focus:outline focus:outline-[3px] focus:outline-offset-2 disabled:opacity-50 ${palette}`}
    >
      {pending ? 'Working…' : children}
    </button>
  );
}

/** What the last submission did. Announced, so it is not only a colour. */
export function ActionNote({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return (
    <p
      role="status"
      className={`mt-1.5 text-[12.5px] leading-relaxed ${
        state.ok ? 'text-[#1c6650]' : 'text-[#8a3a2a]'
      }`}
    >
      {state.ok ? state.message : state.error}
    </p>
  );
}

/**
 * A destructive or consequential action, behind an explicit second step —
 * AGENTS.md's UI rule, "no destructive action without explicit
 * confirmation". Deliberately an in-page swap rather than a browser
 * `confirm()` dialog: a native modal blocks the page, cannot be styled to
 * name what is about to happen, and is dismissed by muscle memory.
 */
export function ConfirmSubmit({
  label,
  confirmLabel,
  question,
  tone = 'destructive',
  disabled,
}: {
  label: string;
  confirmLabel: string;
  question: string;
  tone?: 'primary' | 'destructive';
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setArmed(true)}
        className={`focus:outline-accent min-h-[44px] whitespace-nowrap rounded-xl border px-3.5 text-[13px] font-bold focus:outline focus:outline-[3px] focus:outline-offset-2 disabled:opacity-50 ${
          tone === 'destructive'
            ? 'border-[#d8b4a8] bg-white text-[#8a3a2a]'
            : 'border-[#0d4a43] bg-[#0d4a43] text-white'
        }`}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-[#e0c39a] bg-[#fff8ec] p-3">
      <p className="text-[12.5px] leading-relaxed text-[#5a4212]">{question}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <SubmitButton tone={tone}>{confirmLabel}</SubmitButton>
        <button
          type="button"
          onClick={() => setArmed(false)}
          className="focus:outline-accent min-h-[44px] rounded-xl border border-[#ccd7d4] bg-white px-3.5 text-[13px] font-bold text-[#14232e] focus:outline focus:outline-[3px] focus:outline-offset-2"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
