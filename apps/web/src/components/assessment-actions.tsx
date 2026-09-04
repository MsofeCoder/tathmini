'use client';

import { useEffect, useState } from 'react';
import { draftKey } from '@/lib/drafts';
import { listQueued } from '@/lib/outbox';

export interface AssessmentAction {
  instrumentId: string;
  code: string;
  label: string;
  /** Confirmed submitted on the server. */
  submitted: boolean;
}

/**
 * Per-instrument Start / Submitted / Waiting-to-send buttons for the
 * trainee profile.
 *
 * The submitted state comes from the server, but "waiting to send" can only
 * be known on the device — a submission queued offline exists nowhere else
 * yet. Without this the profile would still say "Start", and a supervisor
 * who marked a trainee in a dead zone would have no way to tell their work
 * was captured, and would reasonably mark them a second time.
 */
export function AssessmentActions({
  traineeId,
  actions,
}: {
  traineeId: string;
  actions: AssessmentAction[];
}) {
  const [queuedInstrumentIds, setQueuedInstrumentIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    void listQueued().then((queued) => {
      const keys = new Set(queued.map((record) => record.key));
      setQueuedInstrumentIds(
        new Set(
          actions
            .filter((action) => keys.has(draftKey(traineeId, action.instrumentId)))
            .map((action) => action.instrumentId),
        ),
      );
    });
  }, [traineeId, actions]);

  return (
    <div className="mt-5 flex flex-col gap-2.5">
      {actions.map((action) => {
        if (action.submitted) {
          return (
            <div
              key={action.code}
              className="flex min-h-[52px] items-center justify-between rounded-xl border border-[#dae3e0] bg-[#f1f3f4] px-4"
            >
              <span className="text-[15px] font-semibold text-[#3c4c58]">{action.label}</span>
              <span className="text-[13px] font-bold text-[#1c6650]">Submitted ✓</span>
            </div>
          );
        }
        if (queuedInstrumentIds.has(action.instrumentId)) {
          return (
            <div
              key={action.code}
              className="rounded-xl border border-[#f0dcb4] bg-[#fffaf0] px-4 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-[15px] font-semibold text-[#3c4c58]">{action.label}</span>
                <span className="text-[13px] font-bold text-[#6b4400]">Waiting to send</span>
              </div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[#6b4400]">
                Marked and saved on this phone. It will send itself when there is signal — you do
                not need to mark this trainee again.
              </p>
            </div>
          );
        }
        return (
          <a
            key={action.code}
            href={`/trainee/${traineeId}/mark/${action.code}`}
            className="focus:outline-accent flex min-h-[52px] items-center justify-center rounded-xl bg-[#12665b] text-[15px] font-bold text-white focus:outline focus:outline-[3px] focus:outline-offset-2"
          >
            Start {action.label}
          </a>
        );
      })}
    </div>
  );
}
