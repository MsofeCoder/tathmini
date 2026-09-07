'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adviceFor } from '@tathmini/shared';
import {
  flaggedCriteria,
  groupBySection,
  percentComplete,
  scoredCount,
  sectionBelowHalf,
  sectionGateWarning,
  sectionJumpRows,
  sectionSubtotal,
  tpPhaseLabels,
  type CriterionRow,
  type MarksByCriterion,
  type TpPhaseCode,
} from '@/lib/marking';
import { draftKey, loadDraft, saveDraft, type DraftState } from '@/lib/drafts';
import { submitTpAssessment } from '@/lib/submit-phase';
import { tpReadyToSubmit, type TpSubmitPhase } from '@/lib/tp-submit';
import { AdviceSuggestions } from './advice-suggestions';
import { CriterionCard, criterionAnchor } from './criterion-card';
import { QueuedConfirmation } from './marking-form';

/**
 * ONE TP lesson, marked one section per page.
 *
 * The 63 criteria of a TP assessment used to sit on a single scrolling page
 * (still what IPT uses), which on a phone held one-handed in a workshop meant
 * losing your place and not knowing which sections were finished. One section
 * per page, with the gate at the section boundary rather than at submit,
 * means a supervisor cannot walk away from a half-marked section and cannot
 * arrive at the end with scattered gaps to hunt down.
 *
 * The two lessons are NOT chained. An earlier version walked out of the last
 * Theory section straight into the first Practical one and ended at a review
 * page; both are gone. The trainee profile is the pre-assessment page, and
 * Theory and Practical are two doors off it that open in either order — a
 * supervisor may watch the workshop lesson on Tuesday and the classroom
 * lesson on Thursday, and marking one must never depend on having started the
 * other. Leaving a lesson saves it and returns to that page.
 *
 * Submission is therefore not the end of this walk. Once every criterion of
 * every unsubmitted phase carries a score — which this screen can see,
 * because it reads both phases' drafts — the Save button becomes Submit, and
 * the same button appears on the profile (see `tp-submit-button.tsx`). Both
 * ask `lib/tp-submit.ts`, so the two can never disagree.
 *
 * What has NOT changed, and must not:
 *   - Each phase is still its own statement, drafted under its own key
 *     (`draftKey(traineeId, instrumentId)`) and submitted through the same
 *     path as before. Nothing merges the two into one mark.
 *   - The database's `validate_and_finalize_mark()` refuses an incomplete
 *     statement whatever this component believes.
 *   - No total, grade or verdict is computed here. The subtotals on screen
 *     are the supervisor's own running arithmetic, not a published number.
 */

export interface TpStepperPhase {
  instrumentId: string;
  code: TpPhaseCode;
  /** "TP Theory" / "TP Practical", from the instruments table. */
  label: string;
  maxTotal: number;
  criteria: CriterionRow[];
}

export interface TpMarkingStepperProps {
  traineeId: string;
  traineeName: string;
  slot: 'a1' | 'a2';
  /**
   * Every phase still to be marked — Theory first. Only `startPhaseIndex` is
   * marked here; the others are present so this screen can tell whether the
   * whole assessment is ready to submit.
   */
  phases: TpStepperPhase[];
  /** The phase the supervisor opened. */
  startPhaseIndex: number;
  returnHref?: string;
}

interface PhaseState {
  marks: MarksByCriterion;
  sectionComments: Record<string, string>;
  generalComment: string;
}

const emptyPhaseState = (): PhaseState => ({
  marks: {},
  sectionComments: {},
  generalComment: '',
});

export function TpMarkingStepper({
  traineeId,
  traineeName,
  slot,
  phases,
  startPhaseIndex,
  returnHref,
}: TpMarkingStepperProps) {
  const backHref = returnHref ?? `/trainee/${traineeId}`;

  const [stepIndex, setStepIndex] = useState(0);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [gateWarning, setGateWarning] = useState<string | null>(null);
  const [dismissedAdvice, setDismissedAdvice] = useState<Set<string>>(new Set());
  const [savedLabel, setSavedLabel] = useState('');
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);

  const [state, setState] = useState<Record<string, PhaseState>>(() =>
    Object.fromEntries(phases.map((p) => [p.instrumentId, emptyPhaseState()])),
  );

  const keyFor = useCallback(
    (instrumentId: string) => draftKey(traineeId, instrumentId),
    [traineeId],
  );

  // Both phases' drafts are read, though only one is marked here: the other
  // one's state is what decides whether this lesson ends at Save or at
  // Submit.
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      phases.map(async (p) => [p.instrumentId, await loadDraft(keyFor(p.instrumentId))] as const),
    ).then((restored) => {
      if (cancelled) return;
      setState((prev) => {
        const next = { ...prev };
        for (const [instrumentId, draft] of restored) {
          if (draft) next[instrumentId] = draft;
        }
        return next;
      });
      setDraftLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [phases, keyFor]);

  // Autosave the lesson being marked. Nothing else on this screen writes, so
  // there is one draft to keep and it is written at most every 400 ms.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phase = phases[startPhaseIndex];
  const phaseId = phase?.instrumentId;
  useEffect(() => {
    if (!draftLoaded || !phaseId) return;
    const slice = state[phaseId];
    if (!slice) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveDraft(keyFor(phaseId), slice as DraftState).then(() => setSavedLabel('Draft saved'));
    }, 400);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [state, phaseId, keyFor, draftLoaded]);

  const sections = useMemo(
    () => (phase ? groupBySection(phase.criteria) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase?.instrumentId],
  );

  // Ready to send: every criterion of EVERY unsubmitted phase is scored.
  const readyToSubmit = useMemo(
    () =>
      tpReadyToSubmit(
        phases.map((p): TpSubmitPhase => ({
          instrumentId: p.instrumentId,
          code: p.code,
          label: p.label,
          criteria: p.criteria,
        })),
        state,
      ),
    [phases, state],
  );

  if (queued) {
    return <QueuedConfirmation returnHref={backHref} instrumentLabel="TP" />;
  }

  if (!phase) {
    // Nothing left to mark on this trainee. Reached only by a hand-typed url.
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#eceff0] p-6">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm">
          <h1 className="text-[22px] font-bold text-neutral-900">Nothing left to mark</h1>
          <a
            href={backHref}
            className="text-teal-mid mt-6 flex min-h-[48px] items-center justify-center rounded-xl border border-[#ccd7d4] text-[15px] font-semibold"
          >
            ‹ Back to trainee
          </a>
        </div>
      </main>
    );
  }

  const phaseState = state[phase.instrumentId] ?? emptyPhaseState();
  const marks = phaseState.marks;
  const section = sections[Math.min(stepIndex, sections.length - 1)];
  const phaseLabels = tpPhaseLabels(phase.code);
  const lastSection = stepIndex >= sections.length - 1;

  // This lesson's own progress — not the trainee's two lessons combined. The
  // supervisor is marking one lesson; a bar counting the other one's criteria
  // would read as unfinished work on a lesson they have finished.
  const phaseDone = scoredCount(phase.criteria, marks);
  const phasePct = percentComplete(phaseDone, phase.criteria.length);

  function updatePhase(patch: Partial<PhaseState>) {
    setState((prev) => ({
      ...prev,
      [phase!.instrumentId]: { ...(prev[phase!.instrumentId] ?? emptyPhaseState()), ...patch },
    }));
    setSavedLabel('');
  }

  function setScore(criterionId: string, score: number) {
    updatePhase({
      marks: {
        ...marks,
        [criterionId]: { score, comment: marks[criterionId]?.comment ?? '' },
      },
    });
    // A score is the answer to the warning, so the warning goes with it.
    setGateWarning(null);
  }

  function setSectionComment(sectionCode: string, comment: string) {
    updatePhase({
      sectionComments: { ...phaseState.sectionComments, [sectionCode]: comment },
    });
  }

  function setGeneralComment(comment: string) {
    updatePhase({ generalComment: comment });
  }

  /** Advice for sub-criteria below the flag threshold, minus anything already
   * dismissed or already sitting in the box. Same rule as the long form. */
  function suggestionsFor(criteriaToCheck: CriterionRow[], existing: string) {
    // The flag threshold lives in one place (lib/marking, mirroring
    // packages/shared's schemas). Never re-derived here.
    return flaggedCriteria('points', criteriaToCheck, marks)
      .filter((c) => !dismissedAdvice.has(c.id))
      .map((c) => ({
        id: c.id,
        text: adviceFor(phase!.code, c.sectionCode, c.itemCode, c.itemLabel),
      }))
      .filter((s) => !existing.includes(s.text));
  }

  function mergeAdvice(existing: string, lines: string[]): string {
    if (lines.length === 0) return existing;
    const prefix = existing.trim() ? `${existing.trim()}\n\n` : '';
    return prefix + lines.join(' ');
  }

  function goToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * Which unmarked criterion the gate warning points at next. The warning
   * says how many are missing; tapping it takes the supervisor to one of
   * them, and tapping again walks to the next, so a section with several
   * gaps does not need hunting through on a phone.
   *
   * The list is recomputed from `marks` on every tap rather than captured
   * when the warning appeared: by then the supervisor may have scored some
   * of them, and being sent to a row that is already marked reads as a bug.
   */
  const gateCursor = useRef(0);

  function jumpToUnmarked() {
    if (!section) return;
    const unmarked = section.criteria.filter((c) => marks[c.id]?.score == null);
    if (unmarked.length === 0) {
      // Everything got scored while the warning was on screen; the warning is
      // stale, so clear it rather than scroll to nothing.
      setGateWarning(null);
      return;
    }
    const target = unmarked[gateCursor.current % unmarked.length]!;
    gateCursor.current += 1;
    document
      .getElementById(criterionAnchor(target.id))
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /** Write the draft now rather than on the 400 ms timer — the supervisor is
   * about to leave the screen. */
  async function flushDraft() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await saveDraft(keyFor(phase!.instrumentId), phaseState as DraftState);
  }

  async function handleFinish() {
    if (readyToSubmit) {
      setSubmitting(true);
      setSubmitError(null);
      await flushDraft();
      const result = await submitTpAssessment({
        traineeId,
        traineeName,
        slot,
        phases: phases.map((p): TpSubmitPhase => ({
          instrumentId: p.instrumentId,
          code: p.code,
          label: p.label,
          criteria: p.criteria,
        })),
        drafts: state,
      });
      setSubmitting(false);
      if (result.kind === 'rejected') {
        setSubmitError(result.error);
        return;
      }
      if (result.kind === 'incomplete') {
        setSubmitError('Some criteria are still unscored. Every criterion must carry a score.');
        return;
      }
      if (result.kind === 'queued') {
        setQueued(true);
        return;
      }
      // A full navigation, not router.push: a client-side one fetches the
      // target route's payload from the server, which fails on signal that
      // has just dropped — right after a submit, at the worst moment.
      window.location.assign(backHref);
      return;
    }

    // Not ready to send: this lesson is simply saved, and the supervisor is
    // returned to the pre-assessment page to pick the other one — or to come
    // back to this one another day.
    setSubmitting(true);
    await flushDraft();
    window.location.assign(backHref);
  }

  function stepNext() {
    if (!section) return;
    const warning = sectionGateWarning(section, marks);
    if (warning) {
      gateCursor.current = 0;
      setGateWarning(warning);
      goToTop();
      return;
    }
    setGateWarning(null);
    if (!lastSection) {
      setStepIndex(stepIndex + 1);
      goToTop();
      return;
    }
    void handleFinish();
  }

  function stepBack() {
    setGateWarning(null);
    if (stepIndex > 0) {
      setStepIndex(stepIndex - 1);
      goToTop();
      return;
    }
    window.location.assign(backHref);
  }

  function jumpTo(targetStepIndex: number) {
    setStepIndex(targetStepIndex);
    setJumpOpen(false);
    setGateWarning(null);
    goToTop();
  }

  const jumpRows = section ? sectionJumpRows(sections, marks, stepIndex) : [];
  const finishLabel = readyToSubmit ? 'Submit assessment' : 'Save assessment';
  const nextLabel = !lastSection ? 'Next' : finishLabel;

  return (
    <main className="min-h-dvh bg-[#eceff0] pb-28">
      <div className="sticky top-0 z-10 border-b border-[#e1e9e6] bg-white px-4 pb-3 pt-3">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={stepBack}
            className="text-teal-mid focus:outline-accent min-h-11 text-[14px] font-semibold focus:outline focus:outline-[3px] focus:outline-offset-2"
          >
            ‹ Back
          </button>
          <div className="flex items-center gap-2">
            {savedLabel ? (
              <span className="text-[11.5px] font-bold text-[#1c6650]">{savedLabel}</span>
            ) : null}
            <span className="text-[12px] font-semibold text-[#5b6b78]">{traineeName}</span>
          </div>
        </div>

        {/* One bar, and the jump control as an icon beside it. The bar counts
            THIS lesson only: Theory and Practical are marked separately, and a
            bar that also counted the other lesson's criteria would read as
            unfinished work on a lesson the supervisor has just finished. */}
        <div className="mt-2 flex items-center gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-semibold text-[#5f6f7c]">
                {phaseLabels.short} lesson
              </span>
              <span className="text-[11px] font-bold text-[#5f6f7c]">
                {phaseDone}/{phase.criteria.length} · {phasePct}%
              </span>
            </div>
            <div className="mt-1 h-[7px] overflow-hidden rounded-full bg-[#e6ecea]">
              <div
                className="h-full rounded-full transition-[width]"
                style={{
                  width: `${phasePct}%`,
                  background: phasePct === 100 ? '#1c7a5e' : '#a35c00',
                }}
              />
            </div>
          </div>

          {/* Icon only, but never smaller than a thumb: 44 px is the floor on
              this screen (AGENTS.md § UI rules), and the accessible name is
              what carries the meaning the word "Sections" used to. */}
          <button
            type="button"
            aria-expanded={jumpOpen}
            aria-label={jumpOpen ? 'Hide the section list' : 'Jump to a section'}
            onClick={() => setJumpOpen(!jumpOpen)}
            className="focus:outline-accent flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-[#ccd7d4] bg-white text-[15px] font-bold text-[#3c4c58] focus:outline focus:outline-[3px] focus:outline-offset-2"
          >
            {jumpOpen ? '⌃' : '⌄'}
          </button>
        </div>

        {jumpOpen ? (
          <ul className="mt-2 flex max-h-[46vh] flex-col gap-1.5 overflow-y-auto pb-1">
            {jumpRows.map((row) => (
              <li key={row.code}>
                <button
                  type="button"
                  onClick={() => jumpTo(row.index)}
                  aria-current={row.current ? 'step' : undefined}
                  className={`focus:outline-accent flex min-h-11 w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left focus:outline focus:outline-[3px] focus:outline-offset-2 ${
                    row.current ? 'border-[#0d4a43] bg-[#e8f1ef]' : 'border-[#e1e9e6] bg-white'
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${
                      row.complete
                        ? 'bg-[#1c7a5e] text-white'
                        : row.current
                          ? 'bg-[#0d4a43] text-white'
                          : 'bg-[#eef1f3] text-[#4d5f6c]'
                    }`}
                  >
                    {row.marker}
                  </span>
                  <span
                    className={`min-w-0 flex-1 truncate text-[13px] ${
                      row.current ? 'font-bold text-[#0d4a43]' : 'font-semibold text-[#3c4c58]'
                    }`}
                  >
                    {row.code}. {row.label}
                  </span>
                  <span className="shrink-0 text-[12px] font-bold text-[#5f6f7c]">
                    {row.done}/{row.total}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {gateWarning ? (
        <div
          role="alert"
          className="mx-4 mt-4 rounded-xl border border-l-4 border-[#f0d3ca] border-l-[#8a3a2a] bg-[#fdf1ee]"
        >
          {/* The whole warning is the target, not a small link inside it: on a
              phone held one-handed the thumb lands somewhere in the message,
              and 44 px of padding makes the whole box that size anyway. */}
          <button
            type="button"
            onClick={jumpToUnmarked}
            className="focus:outline-accent block w-full rounded-xl p-4 text-left focus:outline focus:outline-[3px] focus:outline-offset-2"
          >
            <span className="block text-[13.5px] leading-relaxed text-[#7a3325]">
              {gateWarning}
            </span>
            <span className="mt-2 block text-[12.5px] font-bold text-[#8a3a2a] underline">
              Take me to it ›
            </span>
          </button>
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

      {section ? (
        <div className="px-4 py-5">
          <div className="text-teal-mid text-[11.5px] font-extrabold tracking-[0.8px]">
            SECTION {stepIndex + 1} · {phaseLabels.short.toUpperCase()} LESSON
          </div>
          <h2 className="mt-1 text-[18px] font-bold leading-snug tracking-[-0.2px] text-neutral-900">
            {section.code}. {section.label} — {section.max} pts
          </h2>

          <div className="mt-2.5 flex items-center justify-between gap-3 rounded-[10px] bg-[#e8f1ef] px-3 py-2.5">
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
                kind="points"
                score={marks[c.id]?.score ?? null}
                onScore={(score) => setScore(c.id, score)}
              />
            ))}
          </div>

          {/* The merged COMMENTS cell, in its place on the form: directly
              below this criterion's own questions. Never required; the prompt
              appears when the criterion as a whole lands below half. */}
          <div className="mt-3 rounded-xl border border-[#e1e9e6] bg-white p-3.5">
            <label
              htmlFor={`section-comment-${phase.code}-${section.code}`}
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
              items={suggestionsFor(
                section.criteria,
                phaseState.sectionComments[section.code] ?? '',
              )}
              onDismiss={(id) => setDismissedAdvice((prev) => new Set(prev).add(id))}
              onAddAll={(lines) =>
                setSectionComment(
                  section.code,
                  mergeAdvice(phaseState.sectionComments[section.code] ?? '', lines),
                )
              }
            />
            <textarea
              id={`section-comment-${phase.code}-${section.code}`}
              value={phaseState.sectionComments[section.code] ?? ''}
              onChange={(e) => setSectionComment(section.code, e.target.value)}
              placeholder="Advice for this criterion"
              className="focus:outline-accent mt-2 min-h-[84px] w-full rounded-[10px] border border-[#ccd7d4] p-3 text-[14px] leading-relaxed focus:outline focus:outline-[3px] focus:outline-offset-1"
            />
          </div>

          {/* SUPERVISOR'S GENERAL COMMENTS — one per lesson, on the last
              section of that lesson, which is where the paper form puts it. */}
          {lastSection ? (
            <div className="mt-5">
              <div className="text-teal-mid text-[11.5px] font-extrabold tracking-[0.8px]">
                SUPERVISOR’S GENERAL COMMENTS · {phaseLabels.short.toUpperCase()}
              </div>
              <div className="mt-2 rounded-xl border border-[#e1e9e6] bg-white p-3.5">
                <label
                  htmlFor={`general-comment-${phase.code}`}
                  className="text-[12.5px] font-semibold text-[#3c4c58]"
                >
                  Your comment to the trainee on this lesson
                </label>
                <p className="mt-1 text-[12px] leading-snug text-[#5b6b78]">
                  Optional. After the assessment the trainee should be consulted and advised on all
                  matters arising.
                </p>
                <textarea
                  id={`general-comment-${phase.code}`}
                  value={phaseState.generalComment}
                  onChange={(e) => setGeneralComment(e.target.value)}
                  placeholder="Overall advice for the trainee"
                  className="focus:outline-accent mt-2 min-h-[120px] w-full rounded-[10px] border border-[#ccd7d4] p-3 text-[14px] leading-relaxed focus:outline focus:outline-[3px] focus:outline-offset-1"
                />
              </div>

              <p className="mt-2 text-[12px] leading-relaxed text-[#5f6f7c]">
                {readyToSubmit
                  ? 'Both lessons are fully scored, so this sends the whole TP assessment to the College.'
                  : 'This saves the lesson on this phone and takes you back to the trainee. You can mark the other lesson now or another day; nothing is sent until both are complete.'}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="fixed bottom-0 left-0 right-0 flex gap-2.5 border-t border-[#e1e9e6] bg-[#eceff0] p-4">
        <button
          type="button"
          onClick={stepBack}
          className="focus:outline-accent min-h-[52px] flex-1 rounded-xl border border-[#ccd7d4] bg-white text-[15px] font-bold text-[#3c4c58] focus:outline focus:outline-[3px] focus:outline-offset-2"
        >
          Back
        </button>
        <button
          type="button"
          onClick={stepNext}
          disabled={submitting}
          className="focus:outline-accent min-h-[52px] flex-[1.4] rounded-xl bg-[#12665b] text-[15px] font-bold text-white focus:outline focus:outline-[3px] focus:outline-offset-2 disabled:opacity-60"
        >
          {submitting ? 'Saving…' : nextLabel}
        </button>
      </div>
    </main>
  );
}
