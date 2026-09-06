'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { CHANGE_FIELDS } from '@/lib/admin/change-requests';
import { requestTraineeCorrection, type CorrectionResult } from './correction-actions';

/**
 * "Report a correction", on the supervisor's own trainee screen.
 *
 * Closed by default and opened deliberately: this screen's job is to get
 * somebody into an assessment, and a form sitting open above the Start button
 * competes with that. The prototype's profile has no such control — it is new,
 * and it is kept out of the way accordingly.
 *
 * It needs a connection, unlike the marking flow. That is honest rather than
 * unfortunate: the request goes to a person, not to the device, and a supervisor
 * with no signal has nothing to gain from it being queued silently.
 */
export function ReportCorrection({ traineeId }: { traineeId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<CorrectionResult | null, FormData>(
    requestTraineeCorrection,
    null,
  );

  if (state?.ok) {
    return (
      <div className="mt-4 rounded-xl border border-[#cfe0d9] bg-[#f2f8f5] px-4 py-3.5">
        <p className="text-[13px] font-bold text-[#1c6650]">Correction sent</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[#3c5a50]">{state.message}</p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus:outline-accent mt-3 min-h-[44px] w-full rounded-xl border border-[#ccd7d4] bg-white text-[14px] font-semibold text-[#3c4c58] focus:outline focus:outline-[3px] focus:outline-offset-2"
      >
        Something above is wrong — report a correction
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-4 rounded-2xl border border-[#e1e9e6] bg-white p-4">
      <input type="hidden" name="traineeId" value={traineeId} />

      <p className="text-[14px] font-bold text-[#14232e]">Report a correction</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-[#5f6f7c]">
        This does not change the register. It goes to the Administrator, who decides.
      </p>

      <label className="mt-3.5 flex flex-col gap-1.5 text-[13px] font-semibold text-[#3c4c58]">
        Which particular is wrong?
        <select
          name="field"
          required
          defaultValue="email"
          className="focus:outline-accent min-h-[48px] rounded-[10px] border border-[#ccd7d4] bg-white px-3 text-[15px] font-normal text-neutral-900 focus:outline focus:outline-[3px] focus:outline-offset-1"
        >
          {CHANGE_FIELDS.map((field) => (
            <option key={field.key} value={field.key}>
              {field.label}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-3.5 flex flex-col gap-1.5 text-[13px] font-semibold text-[#3c4c58]">
        What should it say?
        <input
          name="requestedValue"
          autoCapitalize="none"
          spellCheck={false}
          className="focus:outline-accent min-h-[48px] rounded-[10px] border border-[#ccd7d4] px-3 text-[15px] font-normal text-neutral-900 focus:outline focus:outline-[3px] focus:outline-offset-1"
        />
        <span className="text-[12px] font-normal text-[#5f6f7c]">
          Leave empty to ask for it to be cleared.
        </span>
      </label>

      <label className="mt-3.5 flex flex-col gap-1.5 text-[13px] font-semibold text-[#3c4c58]">
        How do you know?
        <textarea
          name="reason"
          required
          rows={3}
          placeholder="e.g. The trainee told me this address belongs to their brother."
          className="focus:outline-accent rounded-[10px] border border-[#ccd7d4] px-3 py-2.5 text-[15px] font-normal leading-relaxed text-neutral-900 focus:outline focus:outline-[3px] focus:outline-offset-1"
        />
      </label>

      {state && !state.ok ? (
        <p role="status" className="mt-2.5 text-[13px] leading-relaxed text-[#8a3a2a]">
          {state.error}
        </p>
      ) : null}

      <div className="mt-4 flex gap-2.5">
        <SendButton />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="focus:outline-accent min-h-[48px] flex-1 rounded-xl border border-[#ccd7d4] bg-white text-[14px] font-semibold text-[#3c4c58] focus:outline focus:outline-[3px] focus:outline-offset-2"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="focus:outline-accent min-h-[48px] flex-1 rounded-xl bg-[#0d4a43] text-[14px] font-bold text-white focus:outline focus:outline-[3px] focus:outline-offset-2 disabled:opacity-60"
    >
      {pending ? 'Sending…' : 'Send to Administrator'}
    </button>
  );
}
