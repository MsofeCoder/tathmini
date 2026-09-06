'use client';

import { useActionState, useState } from 'react';
import type { ActionResult } from '@/lib/admin/session';
import { planAssessmentVoid, voidConfirmLabel, type VoidTarget } from '@/lib/admin/void-assessment';
import { ActionNote, ConfirmSubmit } from '../forms';
import { voidTraineeAssessment } from './actions';

/**
 * "Void this assessment" — returning one assessed trainee to "Not yet
 * assessed".
 *
 * The reason is typed BEFORE the confirmation arms, not after, and the confirm
 * button stays disabled until it is long enough. That ordering is deliberate:
 * the point of a typed reason is that the administrator has to put the
 * justification into words while deciding, not invent one after they have
 * already committed to the decision. It is the same reason `result_revisions`
 * carries a NOT NULL, non-empty reason (CONTEXT.md: a Super Admin may correct a
 * mark, but only as a superseding revision with a typed reason).
 *
 * The consequences are listed as a plain list rather than compressed into the
 * confirmation sentence, because this is the most consequential button in the
 * console and the person pressing it is usually in a hurry.
 */
export function VoidAssessmentForm({
  traineeId,
  target,
  disabled,
}: {
  traineeId: string;
  target: VoidTarget;
  disabled: boolean;
}) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    voidTraineeAssessment,
    null,
  );
  const [reason, setReason] = useState('');

  const decision = planAssessmentVoid(target);

  if (!decision.ok) {
    return (
      <p className="px-4 pb-4 text-[13px] text-[#5b6b78]">{decision.error} Nothing to void.</p>
    );
  }

  const { plan } = decision;
  // The floor validateReason() applies on the server, and the function itself
  // applies again in Postgres. Disabling the button below it saves a round
  // trip; it is not what enforces the rule.
  const reasonReady = reason.trim().length >= 8;

  return (
    <div className="px-4 pb-4">
      <p className="text-[13px] text-[#14232e]">{plan.summary}</p>

      <ul className="mt-2 space-y-1.5 text-[12.5px] leading-relaxed text-[#4d5f6c]">
        {plan.consequences.map((line) => (
          <li key={line} className="flex gap-2">
            <span aria-hidden="true">·</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>

      {plan.sentReportWarning ? (
        <p className="mt-3 rounded-xl border border-[#e0c39a] bg-[#fff8ec] p-3 text-[12.5px] leading-relaxed text-[#5a4212]">
          {plan.sentReportWarning}
        </p>
      ) : null}

      {disabled ? (
        <p className="mt-3 text-[12.5px] text-[#5b6b78]">
          Read-only access — only a Super Administrator can void an assessment.
        </p>
      ) : (
        <form action={formAction} className="mt-3">
          <input type="hidden" name="confirm" value="void-assessment" />
          <input type="hidden" name="traineeId" value={traineeId} />

          <label
            htmlFor="void-reason"
            className="block text-[12px] font-bold uppercase tracking-[0.5px] text-[#5b6b78]"
          >
            Why is this assessment being voided?
          </label>
          <textarea
            id="void-reason"
            name="reason"
            rows={3}
            required
            minLength={8}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Marked against the wrong trainee — these scores belong to JOHN MSOFE on TP ROUTE 3."
            className="focus:outline-accent mt-1.5 w-full rounded-xl border border-[#ccd7d4] bg-white p-3 text-[13px] text-[#14232e] focus:outline focus:outline-[3px] focus:outline-offset-2"
          />
          <p className="mt-1 text-[12px] text-[#5b6b78]">
            Stored with your name on the void archive and the audit trail, and read by whoever asks
            later why this trainee was assessed twice. At least 8 characters.
          </p>

          <div className="mt-2.5">
            <ConfirmSubmit
              disabled={!reasonReady}
              label="Void this assessment"
              confirmLabel={voidConfirmLabel(target)}
              question={`This clears every mark and the computed result for ${target.traineeName}, after copying them to the void archive. It cannot be undone from the console, and the assessment will have to be done again by both assessors.`}
            />
          </div>

          <ActionNote state={state} />
        </form>
      )}
    </div>
  );
}
