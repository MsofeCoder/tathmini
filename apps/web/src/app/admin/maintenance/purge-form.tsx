'use client';

import { useActionState } from 'react';
import type { ActionResult } from '@/lib/admin/session';
import { ActionNote, ConfirmSubmit } from '../forms';
import { purgeTestTrainees } from './actions';

/**
 * The one irreversible button in the console.
 *
 * The confirmation names the exact numbers rather than asking "are you sure?",
 * because the person pressing this on a Monday morning needs to see that it is
 * about to take 13 marks with it — and, if the figure ever reads more than the
 * 46 test rows they expect, needs the chance to stop.
 */
export function PurgeForm({
  traineeCount,
  markCount,
  reportCount,
  disabled,
}: {
  traineeCount: number;
  markCount: number;
  reportCount: number;
  disabled: boolean;
}) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    purgeTestTrainees,
    null,
  );

  if (traineeCount === 0) {
    return (
      <p className="px-4 pb-4 text-[13px] text-[#1c6650]">
        ✓ There are no test rows in the register. Nothing to remove.
      </p>
    );
  }

  return (
    <form action={formAction} className="px-4 pb-4">
      <input type="hidden" name="confirm" value="purge-test-data" />
      {disabled ? (
        <p className="text-[12.5px] text-[#5b6b78]">
          Read-only access — only a Super Administrator can remove test data.
        </p>
      ) : (
        <ConfirmSubmit
          label={`Remove ${traineeCount} test trainees`}
          confirmLabel={`Yes, delete ${traineeCount} trainees and ${markCount} marks`}
          question={`This permanently deletes ${traineeCount} test trainees, and cascades to ${markCount} submitted ${
            markCount === 1 ? 'mark' : 'marks'
          } and ${reportCount} generated ${
            reportCount === 1 ? 'report' : 'reports'
          }, including their PDF files. There is no undo. Real trainees cannot be removed by this button — it only ever matches the test-data pattern.`}
        />
      )}
      <ActionNote state={state} />
    </form>
  );
}
