'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  computeGaps,
  criterionKindForInstrument,
  groupBySection,
  isFlagged,
  scoreOptionsFor,
  scoredCount,
  sectionSubtotal,
  type CriterionRow,
  type MarksByCriterion,
} from '@/lib/marking';
import { clearDraft, draftKey, loadDraft, saveDraft } from '@/lib/drafts';
import { enqueueSubmission } from '@/lib/outbox';
import type { SubmitAssessmentInput } from '@/lib/submission';
import { submitAssessment } from '@/app/actions/submit-assessment';

export interface MarkingFormProps {
  traineeId: string;
  traineeName: string;
  instrumentId: string;
  instrumentCode: string;
  instrumentLabel: string;
  slot: 'a1' | 'a2';
  criteria: CriterionRow[];
  /**
   * Where "Back" and a finished submission lead. Defaults to the trainee
   * profile; /offline passes its own route, since the profile is a
   * server-rendered page that cannot load without a connection.
   */
  returnHref?: string;
}

const criterionAnchor = (id: string) => `criterion-${id}`;

export function MarkingForm({
  traineeId,
  traineeName,
  instrumentId,
  instrumentCode,
  instrumentLabel,
  slot,
  criteria,
  returnHref,
}: MarkingFormProps) {
  const router = useRouter();
  const backHref = returnHref ?? `/trainee/${traineeId}`;
  const kind = criterionKindForInstrument(instrumentCode);
  const sections = useMemo(() => groupBySection(criteria), [criteria]);
  const key = useMemo(() => draftKey(traineeId, instrumentId), [traineeId, instrumentId]);

  const [marks, setMarks] = useState<MarksByCriterion>({});
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [savedLabel, setSavedLabel] = useState('');
  const [gapsShown, setGapsShown] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore a local draft (crash/reload survival), then start autosaving.
  useEffect(() => {
    let cancelled = false;
    loadDraft(key).then((restored) => {
      if (!cancelled && restored) setMarks(restored);
      if (!cancelled) setDraftLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  useEffect(() => {
    if (!draftLoaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveDraft(key, marks).then(() => setSavedLabel('Draft saved'));
    }, 400);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [marks, key, draftLoaded]);

  const total = scoredCount(criteria, marks);
  const progressPct = criteria.length === 0 ? 0 : Math.round((total / criteria.length) * 100);
  const gaps = computeGaps(kind, criteria, marks);

  function setScore(criterionId: string, score: number) {
    setMarks((prev) => ({
      ...prev,
      [criterionId]: { score, comment: prev[criterionId]?.comment ?? '' },
    }));
    setSavedLabel('');
  }

  function setComment(criterionId: string, comment: string) {
    setMarks((prev) => ({
      ...prev,
      [criterionId]: { score: prev[criterionId]?.score ?? null, comment },
    }));
    setSavedLabel('');
  }

  function jumpTo(criterionId: string) {
    document
      .getElementById(criterionAnchor(criterionId))
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function handleSubmit() {
    if (gaps.length > 0) {
      setGapsShown(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSubmitting(true);
    setSubmitError(null);

    const payload: SubmitAssessmentInput = {
      traineeId,
      instrumentId,
      instrumentCode,
      slot,
      criteria: criteria.map((c) => ({ id: c.id, itemMax: c.itemMax })),
      items: criteria.map((c) => ({
        criterionId: c.id,
        score: marks[c.id]!.score!,
        comment: marks[c.id]!.comment ?? '',
      })),
    };

    let result;
    try {
      result = await submitAssessment(payload);
    } catch {
      // No usable connection — the marks are complete and valid, so queue
      // them rather than making the supervisor stand in a dead zone. The
      // draft deliberately stays until the outbox confirms it actually sent.
      await enqueueSubmission({ key, payload, traineeName, instrumentLabel });
      setSubmitting(false);
      setQueued(true);
      return;
    }

    if (!result.ok) {
      setSubmitting(false);
      setSubmitError(result.error);
      return;
    }
    await clearDraft(key);
    router.push(backHref);
  }

  if (queued) {
    return <QueuedConfirmation returnHref={backHref} instrumentLabel={instrumentLabel} />;
  }

  return (
    <main className="min-h-dvh bg-[#eceff0] pb-28">
      <div className="sticky top-0 z-10 border-b border-[#e1e9e6] bg-white px-4 pb-3 pt-3">
        <div className="flex items-center justify-between gap-3">
          <a href={backHref} className="text-teal-mid min-h-11 text-[14px] font-semibold">
            ‹ Back
          </a>
          <div className="flex items-center gap-2">
            {savedLabel ? (
              <span className="text-[11.5px] font-bold text-[#1c6650]">{savedLabel}</span>
            ) : null}
            <span className="text-[12px] font-semibold text-[#5b6b78]">{traineeName}</span>
          </div>
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-[17px] font-bold tracking-[-0.2px]">{instrumentLabel}</span>
          <span className="text-[12px] text-[#5f6f7c]">
            {total} of {criteria.length} scored
          </span>
        </div>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[#e6ecea]">
          <div
            className="h-full rounded-full bg-[#0d4a43] transition-[width]"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {gapsShown && gaps.length > 0 ? (
        <div
          role="alert"
          className="mx-4 mt-4 flex gap-3 rounded-xl border border-l-4 border-[#f0d3ca] border-l-[#8a3a2a] bg-[#fdf1ee] p-4"
        >
          <div className="flex-1">
            <p className="text-[14px] font-bold text-[#7a3325]">
              {gaps.length} criterion{gaps.length === 1 ? '' : 'a'} need
              {gaps.length === 1 ? 's' : ''} your attention
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[#7a3325]">
              An unscored criterion counts as zero, which would understate the trainee. Score every
              criterion, and add a comment where one is required, before submitting.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {gaps.map((g) => (
                <button
                  key={`${g.criterion.id}-${g.reason}`}
                  type="button"
                  onClick={() => jumpTo(g.criterion.id)}
                  className="focus:outline-accent flex min-h-11 items-center justify-between gap-3 rounded-lg border border-[#f0d3ca] bg-white px-3 py-2.5 text-left focus:outline focus:outline-[3px] focus:outline-offset-2"
                >
                  <span className="text-[13.5px] font-semibold text-[#7a3325]">
                    {g.criterion.sectionLabel} {g.criterion.itemCode}
                    {g.reason === 'comment' ? ' — needs a comment' : ' — not scored'}
                  </span>
                  <span className="text-[12.5px] font-bold text-[#8a3a2a]">Go ›</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {submitError ? (
        <div
          role="alert"
          className="mx-4 mt-4 rounded-xl border border-[#f0d3ca] bg-[#fdf1ee] p-4 text-[13.5px] text-[#7a3325]"
        >
          {submitError}
        </div>
      ) : null}

      <div className="flex flex-col gap-5 px-4 py-5">
        {sections.map((section) => (
          <section key={section.code}>
            <div className="text-teal-mid text-[11.5px] font-extrabold tracking-[0.8px]">
              {section.code} · {section.label}
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 rounded-[10px] bg-[#e8f1ef] px-3 py-2.5">
              <span className="text-[12.5px] font-semibold text-[#3c4c58]">Section subtotal</span>
              <span className="text-[14px] font-bold text-[#0d4a43]">
                {sectionSubtotal(section, marks)} / {section.max}
              </span>
            </div>

            <div className="mt-3 flex flex-col gap-3">
              {section.criteria.map((c) => {
                const mark = marks[c.id];
                const options = scoreOptionsFor(kind, c.itemMax);
                const flagged = mark?.score != null && isFlagged(kind, mark.score, c.itemMax);
                return (
                  <div
                    key={c.id}
                    id={criterionAnchor(c.id)}
                    className="scroll-mt-32 rounded-xl border border-[#e1e9e6] bg-white p-3.5"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="min-w-[18px] pt-px text-[12px] font-bold text-[#6b7b88]">
                        {c.itemCode}
                      </span>
                      <div className="flex-1 text-[14px] leading-snug text-[#24333e]">
                        {c.itemLabel}
                      </div>
                      <span className="whitespace-nowrap rounded-full bg-[#f1f3f4] px-2 py-1 text-[11px] font-bold text-[#4d5f6c]">
                        {kind === 'ipt' ? '1–5' : `/ ${c.itemMax}`}
                      </span>
                    </div>
                    <div role="group" className="mt-3 flex flex-wrap gap-2">
                      {options.map((opt) => {
                        const pressed = mark?.score === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            aria-pressed={pressed}
                            onClick={() => setScore(c.id, opt)}
                            className={`focus:outline-accent min-h-11 min-w-11 rounded-lg border px-3 text-[14px] font-bold focus:outline focus:outline-[3px] focus:outline-offset-2 ${
                              pressed
                                ? 'border-[#0d4a43] bg-[#12665b] text-white'
                                : 'border-[#ccd7d4] bg-white text-[#3c4c58]'
                            }`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                    {mark?.score == null ? (
                      <p className="mt-2.5 text-[12px] text-[#5b6b78]">Not yet scored</p>
                    ) : null}
                    {flagged ? (
                      <div className="mt-3">
                        <label className="text-[12.5px] font-semibold text-[#3c4c58]">
                          Comment{' '}
                          {kind === 'ipt' ? '(required at 3 or below)' : '(required below half)'}
                        </label>
                        <textarea
                          value={mark?.comment ?? ''}
                          onChange={(e) => setComment(c.id, e.target.value)}
                          placeholder="Say what the trainee should improve — never a grade-word like 'fair' or 'good'"
                          className="focus:outline-accent mt-1.5 min-h-[84px] w-full rounded-[10px] border border-[#ccd7d4] p-3 text-[14px] leading-relaxed focus:outline focus:outline-[3px] focus:outline-offset-1"
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="fixed bottom-0 left-0 right-0 flex gap-2.5 border-t border-[#e1e9e6] bg-[#eceff0] p-4">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="focus:outline-accent min-h-[52px] flex-1 rounded-xl bg-[#12665b] text-[16px] font-bold text-white focus:outline focus:outline-[3px] focus:outline-offset-2 disabled:opacity-60"
        >
          {submitting ? 'Submitting…' : 'Submit assessment'}
        </button>
      </div>
    </main>
  );
}

/**
 * Shown when the submission could not reach the server and was queued. The
 * copy has to leave no doubt the work is safe — a supervisor in a dead zone
 * who thinks their marks were lost will re-do them on paper.
 */
function QueuedConfirmation({
  returnHref,
  instrumentLabel,
}: {
  returnHref: string;
  instrumentLabel: string;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#eceff0] p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm">
        <p className="text-[12px] font-extrabold tracking-[0.7px] text-[#6b4400]">
          SAVED ON THIS DEVICE
        </p>
        <h1 className="mt-2 text-[22px] font-bold text-neutral-900">
          There is no signal right now
        </h1>
        <p className="mt-3 text-[13.5px] leading-relaxed text-[#3c4c58]">
          Your complete {instrumentLabel} assessment is stored safely on this phone. It will send
          itself as soon as there is a connection — you do not need to keep this screen open, and
          you do not need to mark this trainee again.
        </p>
        <a
          href={returnHref}
          className="focus:outline-accent mt-6 flex min-h-[52px] items-center justify-center rounded-xl bg-[#12665b] text-[15px] font-bold text-white focus:outline focus:outline-[3px] focus:outline-offset-2"
        >
          Back to trainee
        </a>
      </div>
    </main>
  );
}
