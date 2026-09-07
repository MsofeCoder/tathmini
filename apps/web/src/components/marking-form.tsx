'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { adviceFor } from '@tathmini/shared';
import {
  computeGaps,
  flaggedCriteria,
  criterionKindForInstrument,
  groupBySection,
  scoredCount,
  sectionBelowHalf,
  sectionSubtotal,
  type CriterionRow,
  type MarksByCriterion,
} from '@/lib/marking';
import { clearDraft, draftKey, loadDraft, saveDraft } from '@/lib/drafts';
import { db } from '@/lib/db';
import { isReachable } from '@/lib/reachability';
import { enqueueSubmission } from '@/lib/outbox';
import type { SubmitAssessmentInput } from '@/lib/submission';
import { submitAssessment } from '@/app/actions/submit-assessment';
import { AdviceSuggestions } from './advice-suggestions';
import { CriterionCard, criterionAnchor } from './criterion-card';

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
  const backHref = returnHref ?? `/trainee/${traineeId}`;
  const kind = criterionKindForInstrument(instrumentCode);
  const sections = useMemo(() => groupBySection(criteria), [criteria]);
  const key = useMemo(() => draftKey(traineeId, instrumentId), [traineeId, instrumentId]);

  const [marks, setMarks] = useState<MarksByCriterion>({});
  // One comment per CRITERION, keyed by section code - the TP forms' merged
  // COMMENTS cell. The IPT form has no such column, so these boxes are not
  // rendered on IPT and nothing is ever written for it.
  const [sectionComments, setSectionComments] = useState<Record<string, string>>({});
  const [generalComment, setGeneralComment] = useState('');
  // Suggestions the supervisor has waved away, by criterion id. Local to the
  // session and never persisted: dismissing is "not this one, not now", not a
  // judgement worth carrying into the next assessment.
  const [dismissedAdvice, setDismissedAdvice] = useState<Set<string>>(new Set());
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
      if (!cancelled && restored) {
        setMarks(restored.marks);
        setSectionComments(restored.sectionComments);
        setGeneralComment(restored.generalComment);
      }
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
      saveDraft(key, { marks, sectionComments, generalComment }).then(() =>
        setSavedLabel('Draft saved'),
      );
    }, 400);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [marks, sectionComments, generalComment, key, draftLoaded]);

  const total = scoredCount(criteria, marks);
  const progressPct = criteria.length === 0 ? 0 : Math.round((total / criteria.length) * 100);
  const gaps = computeGaps(criteria, marks);
  const isTp = kind !== 'ipt';

  function setScore(criterionId: string, score: number) {
    setMarks((prev) => ({
      ...prev,
      [criterionId]: { score, comment: prev[criterionId]?.comment ?? '' },
    }));
    setSavedLabel('');
  }

  /** Advice for the sub-criteria that came out below the flag threshold, minus
   * anything already dismissed or already sitting in the comment box. */
  function suggestionsFor(criteriaToCheck: CriterionRow[], existing: string) {
    return flaggedCriteria(kind, criteriaToCheck, marks)
      .filter((c) => !dismissedAdvice.has(c.id))
      .map((c) => ({
        id: c.id,
        text: adviceFor(instrumentCode, c.sectionCode, c.itemCode, c.itemLabel),
      }))
      .filter((s) => !existing.includes(s.text));
  }

  function dismissAdvice(criterionId: string) {
    setDismissedAdvice((prev) => new Set(prev).add(criterionId));
  }

  /** Merges suggestions into a comment box as ordinary editable prose, exactly
   * as the prototype's mergeAdvice() does: additive, never replacing what the
   * supervisor has already written, and never inserting the same sentence
   * twice. What the trainee reads must be one voice, not a list of clippings. */
  function mergeAdvice(existing: string, lines: string[]): string {
    if (lines.length === 0) return existing;
    const prefix = existing.trim() ? `${existing.trim()}\n\n` : '';
    return prefix + lines.join(' ');
  }

  function setSectionComment(sectionCode: string, comment: string) {
    setSectionComments((prev) => ({ ...prev, [sectionCode]: comment }));
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
      // TP only. Sending IPT section comments would store rows the IPT form
      // has no column for, and nothing would ever print them.
      sectionComments: isTp
        ? sections.map((section) => ({
            sectionCode: section.code,
            comment: sectionComments[section.code] ?? '',
          }))
        : [],
      generalComment,
    };

    // Ask whether the server is actually reachable before trying to reach it.
    // `navigator.onLine` is not enough — it is true on a workshop wifi that
    // routes nowhere — and the cost of finding out the hard way is a
    // supervisor watching a spinner at the end of an assessment. If it is not
    // reachable, the marks go straight to the queue, which is where they were
    // always going to end up.
    if (!(await isReachable())) {
      await enqueueSubmission({ key, payload, traineeName, instrumentLabel });
      setSubmitting(false);
      setQueued(true);
      return;
    }

    let result;
    try {
      result = await submitAssessment(payload);
    } catch {
      // Reachable a moment ago and not now. The marks are complete and valid,
      // so queue them rather than making the supervisor stand in a dead zone.
      // The draft deliberately stays until the outbox confirms it sent.
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

    // Record the submitted mark on the device immediately, rather than
    // waiting for Realtime or the next sync to tell us what we just did. The
    // supervisor lands back on the profile expecting "Submitted ✓", and on a
    // slow connection the round trip that would confirm it can take seconds.
    // The next sync overwrites this row with the server's own.
    await db.marks.put({
      key,
      traineeId,
      instrumentId,
      submittedAt: new Date().toISOString(),
    });

    // A full navigation, not router.push. A client-side navigation fetches
    // the target route's payload from the server; with signal that has just
    // dropped, that fails and takes the app down at the worst possible moment
    // — immediately after a submit, when the supervisor most needs to see
    // their work land. The service worker answers a full navigation from the
    // cached shell whether or not there is a connection.
    window.location.assign(backHref);
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
              criterion before submitting. Comments are yours to add or leave.
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
                    {g.criterion.sectionLabel} {g.criterion.itemCode} — not scored
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
              {section.criteria.map((c) => (
                <CriterionCard
                  key={c.id}
                  criterion={c}
                  kind={kind}
                  score={marks[c.id]?.score ?? null}
                  onScore={(score) => setScore(c.id, score)}
                />
              ))}
            </div>

            {/* The merged COMMENTS cell, in its place on the form: directly
                below the criterion's own questions. TP only — the IPT form
                has no comments column, and its supervisor writes one note at
                the end instead. Never required; the prompt appears when the
                criterion as a whole lands below half. */}
            {isTp ? (
              <div className="mt-3 rounded-xl border border-[#e1e9e6] bg-white p-3.5">
                <label
                  htmlFor={`section-comment-${section.code}`}
                  className="text-[12.5px] font-semibold text-[#3c4c58]"
                >
                  Comments on {section.code} · {section.label}
                </label>
                <p className="mt-1 text-[12px] leading-snug text-[#5b6b78]">
                  {sectionBelowHalf(section, marks)
                    ? 'This criterion scored below half. Say what the trainee should do differently — never a grade-word like “fair” or “good”.'
                    : 'Optional. One comment for this criterion, as on the paper form.'}
                </p>
                <AdviceSuggestions
                  items={suggestionsFor(section.criteria, sectionComments[section.code] ?? '')}
                  onDismiss={dismissAdvice}
                  onAddAll={(lines) =>
                    setSectionComment(
                      section.code,
                      mergeAdvice(sectionComments[section.code] ?? '', lines),
                    )
                  }
                />
                <textarea
                  id={`section-comment-${section.code}`}
                  value={sectionComments[section.code] ?? ''}
                  onChange={(e) => setSectionComment(section.code, e.target.value)}
                  placeholder="Advice for this criterion"
                  className="focus:outline-accent mt-2 min-h-[84px] w-full rounded-[10px] border border-[#ccd7d4] p-3 text-[14px] leading-relaxed focus:outline focus:outline-[3px] focus:outline-offset-1"
                />
              </div>
            ) : null}
          </section>
        ))}

        {/* SUPERVISOR'S GENERAL COMMENTS — on both TP forms and, as
            "Supervisor's Comments", on the IPT form. The only comment surface
            IPT has. */}
        <section>
          <div className="text-teal-mid text-[11.5px] font-extrabold tracking-[0.8px]">
            SUPERVISOR’S GENERAL COMMENTS
          </div>
          <div className="mt-2 rounded-xl border border-[#e1e9e6] bg-white p-3.5">
            <label htmlFor="general-comment" className="text-[12.5px] font-semibold text-[#3c4c58]">
              Your comment to the trainee
            </label>
            <p className="mt-1 text-[12px] leading-snug text-[#5b6b78]">
              Optional. After the assessment the trainee should be consulted and advised on all
              matters arising.
            </p>
            {/* IPT only. On TP each criterion carries its own suggestions
                above its own box, which is where the merged COMMENTS cell
                lives on the paper form; repeating them all down here would
                offer the same sentence twice. */}
            {!isTp ? (
              <AdviceSuggestions
                items={suggestionsFor(criteria, generalComment)}
                onDismiss={dismissAdvice}
                onAddAll={(lines) => {
                  setGeneralComment(mergeAdvice(generalComment, lines));
                  setSavedLabel('');
                }}
              />
            ) : null}
            <textarea
              id="general-comment"
              value={generalComment}
              onChange={(e) => {
                setGeneralComment(e.target.value);
                setSavedLabel('');
              }}
              placeholder="Overall advice for the trainee"
              className="focus:outline-accent mt-2 min-h-[120px] w-full rounded-[10px] border border-[#ccd7d4] p-3 text-[14px] leading-relaxed focus:outline focus:outline-[3px] focus:outline-offset-1"
            />
          </div>
        </section>
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
export function QueuedConfirmation({
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
