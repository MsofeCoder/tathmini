'use client';

import { useActionState, useState } from 'react';
import type { ActionResult } from '@/lib/admin/session';
import { ActionNote, ConfirmSubmit, SubmitButton } from '../forms';
import { applyChangeRequest, declineChangeRequest } from './actions';

/**
 * Apply or decline, side by side, because they are one decision.
 *
 * Applying carries a confirmation naming the field and the new value: it writes
 * to the College's register on the strength of something a supervisor typed on
 * a phone, and that deserves a second look rather than a single tap.
 */
export function DecisionForms({
  requestId,
  fieldLabel,
  requestedDisplay,
  drifted,
  disabled,
}: {
  requestId: string;
  fieldLabel: string;
  requestedDisplay: string;
  /** The register changed after this was raised — applying would overwrite that. */
  drifted: boolean;
  disabled: boolean;
}) {
  const [applyState, applyAction] = useActionState<ActionResult | null, FormData>(
    applyChangeRequest,
    null,
  );
  const [declineState, declineAction] = useActionState<ActionResult | null, FormData>(
    declineChangeRequest,
    null,
  );
  const [declining, setDeclining] = useState(false);

  if (disabled) {
    return (
      <p className="text-[12.5px] text-[#5b6b78]">
        Read-only access — only a Super Administrator can decide a request.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-2">
        <form action={applyAction}>
          <input type="hidden" name="requestId" value={requestId} />
          <ConfirmSubmit
            tone="primary"
            label="Apply"
            confirmLabel={`Yes, set ${fieldLabel.toLowerCase()} to ${requestedDisplay}`}
            question={
              drifted
                ? `The register has changed since this was asked for. Applying it will overwrite what is there now, setting ${fieldLabel.toLowerCase()} to ${requestedDisplay}.`
                : `Set ${fieldLabel.toLowerCase()} to ${requestedDisplay} in the College register?`
            }
          />
        </form>

        {declining ? null : (
          <button
            type="button"
            onClick={() => setDeclining(true)}
            className="focus:outline-accent min-h-[44px] rounded-xl border border-[#d8b4a8] bg-white px-3.5 text-[13px] font-bold text-[#8a3a2a] focus:outline focus:outline-[3px] focus:outline-offset-2"
          >
            Decline
          </button>
        )}
      </div>
      <ActionNote state={applyState} />

      {declining ? (
        <form
          action={declineAction}
          className="rounded-xl border border-[#e0c39a] bg-[#fff8ec] p-3"
        >
          <input type="hidden" name="requestId" value={requestId} />
          <label className="flex flex-col gap-1.5 text-[12.5px] font-semibold text-[#5a4212]">
            Why are you declining? The supervisor will read this.
            <input
              name="note"
              required
              placeholder="e.g. Checked the paper register — the address on file is correct."
              className="focus:outline-accent min-h-[44px] rounded-[10px] border border-[#d9c49c] bg-white px-3 text-[13px] font-normal text-[#14232e] focus:outline focus:outline-[3px] focus:outline-offset-1"
            />
          </label>
          <div className="mt-2.5 flex gap-2">
            <SubmitButton tone="destructive">Decline this request</SubmitButton>
            <button
              type="button"
              onClick={() => setDeclining(false)}
              className="focus:outline-accent min-h-[44px] rounded-xl border border-[#ccd7d4] bg-white px-3.5 text-[13px] font-bold text-[#14232e] focus:outline focus:outline-[3px] focus:outline-offset-2"
            >
              Cancel
            </button>
          </div>
          <ActionNote state={declineState} />
        </form>
      ) : null}
    </div>
  );
}
