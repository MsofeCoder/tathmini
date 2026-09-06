'use client';

import { useActionState } from 'react';
import type { ActionResult } from '@/lib/admin/session';
import { ActionNote, ConfirmSubmit, SubmitButton } from '../forms';
import { setAccountActive, updateContactEmail } from './actions';

export function ContactEmailForm({
  userId,
  current,
  disabled,
}: {
  userId: string;
  current: string | null;
  disabled: boolean;
}) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    updateContactEmail,
    null,
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="userId" value={userId} />
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`contact-${userId}`}>
          Reachable e-mail address
        </label>
        <input
          id={`contact-${userId}`}
          name="contactEmail"
          type="email"
          inputMode="email"
          autoComplete="off"
          spellCheck={false}
          defaultValue={current ?? ''}
          placeholder="none on file"
          disabled={disabled}
          className="focus:outline-accent min-h-[44px] w-full min-w-[200px] max-w-[280px] rounded-[10px] border border-[#ccd7d4] px-3 text-[13px] text-[#14232e] focus:outline focus:outline-[3px] focus:outline-offset-1 disabled:bg-[#f6f8f8]"
        />
        {disabled ? null : <SubmitButton tone="quiet">Save</SubmitButton>}
      </div>
      <ActionNote state={state} />
    </form>
  );
}

export function ActiveToggleForm({
  userId,
  name,
  active,
  disabled,
  isSelf,
}: {
  userId: string;
  name: string;
  active: boolean;
  disabled: boolean;
  isSelf: boolean;
}) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(setAccountActive, null);

  if (disabled) return null;

  return (
    <form action={formAction}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="active" value={active ? 'false' : 'true'} />
      {active ? (
        <ConfirmSubmit
          label="Deactivate"
          confirmLabel="Yes, deactivate"
          disabled={isSelf}
          question={`Deactivate ${name}? They will not be able to sign in. Everything they have already submitted stays on the record, and their assessor slots stay assigned to them — reassign those separately if someone else must mark those trainees.`}
        />
      ) : (
        <ConfirmSubmit
          tone="primary"
          label="Reactivate"
          confirmLabel="Yes, reactivate"
          question={`Reactivate ${name}? They will be able to sign in again with their existing password.`}
        />
      )}
      {isSelf && active ? (
        <p className="mt-1.5 text-[12px] text-[#5b6b78]">
          This is the account you are signed in with.
        </p>
      ) : null}
      <ActionNote state={state} />
    </form>
  );
}
