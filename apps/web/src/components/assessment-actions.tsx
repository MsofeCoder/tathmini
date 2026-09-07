'use client';

import { useEffect, useState } from 'react';
import { draftKey, loadDraft } from '@/lib/drafts';
import type { CriterionRow } from '@/lib/marking';
import { listQueued } from '@/lib/outbox';
import { phaseComplete } from '@/lib/tp-submit';
import { ReportPreviewButton } from './report-preview';

export interface AssessmentAction {
  instrumentId: string;
  code: string;
  label: string;
  /** Confirmed submitted on the server. */
  submitted: boolean;
}

/**
 * Per-instrument buttons on the trainee profile — the pre-assessment page.
 *
 * Four states, and each one is a different thing to a supervisor standing in
 * front of a trainee:
 *
 *   - **Start** — nothing marked yet.
 *   - **Marked ✓** — every criterion of that lesson carries a score and the
 *     draft is saved on this phone, but nothing has been sent. TP lessons are
 *     marked one at a time and submitted together, so this state can last
 *     days, and it is the one the profile most needs to show: without it a
 *     finished lesson still read "Start", and a supervisor with two visits
 *     behind them had no way to see which one was done. It is a button, not a
 *     badge — it reopens the same paginated lesson to look the scores over or
 *     change one before sending.
 *   - **Waiting to send** — submitted while offline; the outbox holds it.
 *   - **Submitted ✓** — on the server, read-only.
 *
 * Only the last of those comes from the server. Marked and Waiting are both
 * device-only facts: a saved draft and a queued submission exist nowhere else
 * yet, and a supervisor who cannot see them will reasonably mark the trainee
 * a second time.
 */
export function AssessmentActions({
  traineeId,
  actions,
  criteriaByInstrument,
}: {
  traineeId: string;
  actions: AssessmentAction[];
  /**
   * The criteria of each instrument still to be submitted, so a saved draft
   * can be told apart from a half-finished one. Absent for IPT, which is one
   * instrument with no pre-assessment page to come back to.
   */
  criteriaByInstrument?: Record<string, CriterionRow[]>;
}) {
  const [queuedInstrumentIds, setQueuedInstrumentIds] = useState<Set<string>>(new Set());
  const [markedInstrumentIds, setMarkedInstrumentIds] = useState<Set<string>>(new Set());

  // Which lessons are fully marked on this phone. Read once per profile
  // render: a lesson is saved by a full navigation back to this page, so
  // there is nothing to subscribe to.
  useEffect(() => {
    if (!criteriaByInstrument) return;
    let cancelled = false;
    Promise.all(
      Object.entries(criteriaByInstrument).map(
        async ([instrumentId, criteria]) =>
          [
            instrumentId,
            phaseComplete(
              criteria,
              (await loadDraft(draftKey(traineeId, instrumentId)))?.marks ?? {},
            ),
          ] as const,
      ),
    ).then((rows) => {
      if (cancelled) return;
      setMarkedInstrumentIds(new Set(rows.filter(([, complete]) => complete).map(([id]) => id)));
    });
    return () => {
      cancelled = true;
    };
  }, [traineeId, criteriaByInstrument]);

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
              className="flex min-h-[52px] items-center justify-between gap-2 rounded-xl border border-[#dae3e0] bg-[#f1f3f4] py-1 pl-4 pr-1"
            >
              <span className="text-[15px] font-semibold text-[#3c4c58]">{action.label}</span>
              <span className="flex items-center gap-1">
                <span className="text-[13px] font-bold text-[#1c6650]">Submitted ✓</span>
                <ReportPreviewButton
                  traineeId={traineeId}
                  variant="icon"
                  ariaLabel={`Preview the ${action.label} report`}
                />
              </span>
            </div>
          );
        }
        if (markedInstrumentIds.has(action.instrumentId)) {
          // Green, ticked, and still a way in. The eye says what tapping it
          // does: look the lesson over. Nothing has been sent, so this is not
          // "Submitted" and must never read like it.
          return (
            <a
              key={action.code}
              href={`/trainee/${traineeId}/mark/${action.code}`}
              className="focus:outline-accent flex min-h-[52px] items-center justify-between gap-2 rounded-xl border border-[#b9d3c8] bg-[#e2f0ea] px-4 text-[15px] font-bold text-[#1c6650] focus:outline focus:outline-[3px] focus:outline-offset-2"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden="true">✓</span>
                <span className="truncate">{action.label} marked</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-[13px] font-semibold">
                <span aria-hidden="true">👁</span>
                Review
              </span>
            </a>
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
            Start {action.label} Assessment
          </a>
        );
      })}
    </div>
  );
}
