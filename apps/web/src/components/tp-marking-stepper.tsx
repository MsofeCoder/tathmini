'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adviceFor } from '@tathmini/shared';
import {
  computeGaps,
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
import { submitPhase } from '@/lib/submit-phase';
import type { SubmitAssessmentInput } from '@/lib/submission';
import { AdviceSuggestions } from './advice-suggestions';
import { CriterionCard } from './criterion-card';
import { QueuedConfirmation } from './marking-form';

/**
 * The TP assessment as a one-section-per-page stepper.
 *
 * TP is two instruments but one visit: the supervisor watches a classroom
 * lesson and a workshop lesson for the same trainee. The long scrolling form
 * (still what IPT uses, and what this replaces for TP) put 63 criteria on one
 * page, which on a phone held one-handed in a workshop meant losing your
 * place and, worse, not knowing which of the ten sections were finished.
 *
 * One section per page, with the gate at the section boundary rather than at
 * submit, means the supervisor cannot walk away from a half-marked section
 * and cannot arrive at the end with scattered gaps to hunt down. The jump
 * dropdown is the one way past that walk — deliberate, visible, and it shows
 * which sections are complete before you use it.
 *
 * What has NOT changed, and must not:
 *   - Each phase is still its own statement, drafted under its own key
 *     (`draftKey(traineeId, instrumentId)`) and submitted through the same
 *     path as before. Nothing merges the two into one mark.
 *   - The whole-instrument gate still applies at review; the database's
 *     `validate_and_finalize_mark()` refuses an incomplete statement whatever
 *     this component believes.
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
  /** Theory first, Practical second; a phase already submitted is absent. */
  phases: TpStepperPhase[];
  /** Which phase the url the supervisor opened lands on. */
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

  const [phaseIndex, setPhaseIndex] = useState(startPhaseIndex);
  const [stepIndex, setStepIndex] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [gateWarning, setGateWarning] = useState<string | null>(null);
  const [dismissedAdvice, setDismissedAdvice] = useState<Set<string>>(new Set());
  const [savedLabel, setSavedLabel] = useState('');
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const [gapsShown, setGapsShown] = useState(false);

  const [state, setState] = useState<Record<string, PhaseState>>(() =>
    Object.fromEntries(phases.map((p) => [p.instrumentId, emptyPhaseState()])),
  );

  const keyFor = useCallback(
    (instrumentId: string) => draftKey(traineeId, instrumentId),
    [traineeId],
  );

  // One draft per phase, restored together. A supervisor who marked Theory
  // this morning and Practical after lunch resumes both halves at once.
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

  // Autosave, per phase, and only the phases that actually changed — the
  // stepper holds two drafts open at once and re-writing the untouched one on
  // every tap would double the writes for nothing.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef<Record<string, string>>({});
  useEffect(() => {
    if (!draftLoaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const writes: Promise<void>[] = [];
      for (const phase of phases) {
        const slice = state[phase.instrumentId];
        if (!slice) continue;
        const serialized = JSON.stringify(slice);
        if (lastSaved.current[phase.instrumentId] === serialized) continue;
        lastSaved.current[phase.instrumentId] = serialized;
        writes.push(saveDraft(keyFor(phase.instrumentId), slice as DraftState));
      }
      if (writes.length > 0) void Promise.all(writes).then(() => setSavedLabel('Draft saved'));
    }, 400);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [state, phases, keyFor, draftLoaded]);

  const phase = phases[phaseIndex];
  const sectionsByPhase = useMemo(() => phases.map((p) => groupBySection(p.criteria)), [phases]);

  // Every criterion of both phases — the "63 criteria" the trainee's overall
  // bar counts against. Phases already submitted are not in `phases`, so a
  // supervisor finishing Practical alone sees a bar for the work in front of
  // them rather than one that can never fill.
  const overall = useMemo(() => {
    let done = 0;
    let total = 0;
    for (const p of phases) {
      const slice = state[p.instrumentId] ?? emptyPhaseState();
      done += scoredCount(p.criteria, slice.marks);
      total += p.criteria.length;
    }
    return { done, total, pct: percentComplete(done, total) };
  }, [phases, state]);

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
  const sections = sectionsByPhase[phaseIndex] ?? [];
  const section = sections[Math.min(stepIndex, sections.length - 1)];
  const phaseLabels = tpPhaseLabels(phase.code);
  const phaseDone = scoredCount(phase.criteria, marks);
  const phasePct = percentComplete(phaseDone, phase.criteria.length);
  const lastSection = stepIndex >= sections.length - 1;
  const nextPhase = phases[phaseIndex + 1];

  function updatePhase(instrumentId: string, patch: Partial<PhaseState>) {
    setState((prev) => ({
      ...prev,
      [instrumentId]: { ...(prev[instrumentId] ?? emptyPhaseState()), ...patch },
    }));
    setSavedLabel('');
  }

  function setScore(criterionId: string, score: number) {
    const current = state[phase!.instrumentId] ?? emptyPhaseState();
    updatePhase(phase!.instrumentId, {
      marks: {
        ...current.marks,
        [criterionId]: { score, comment: current.marks[criterionId]?.comment ?? '' },
      },
    });
    // A score is the answer to the warning, so the warning goes with it.
    setGateWarning(null);
  }

  function setSectionComment(sectionCode: string, comment: string) {
    const current = state[phase!.instrumentId] ?? emptyPhaseState();
    updatePhase(phase!.instrumentId, {
      sectionComments: { ...current.sectionComments, [sectionCode]: comment },
    });
  }

  function setGeneralComment(comment: string) {
    updatePhase(phase!.instrumentId, { generalComment: comment });
  }

  /** Advice for sub-criteria below the flag threshold, minus anything already
   * dismissed or already sitting in the box. Same rule as the long form. */
  function suggestionsFor(criteriaToCheck: CriterionRow[], existing: string) {
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

  function stepNext() {
    if (!section) return;
    const warning = sectionGateWarning(section, marks);
    if (warning) {
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
    // Theory and Practical are separate phases: the end of one is not a gate,
    // it is a doorway into the other.
    if (nextPhase) {
      setPhaseIndex(phaseIndex + 1);
      setStepIndex(0);
      goToTop();
      return;
    }
    setReviewing(true);
    goToTop();
  }

  function stepBack() {
    setGateWarning(null);
    if (stepIndex > 0) {
      setStepIndex(stepIndex - 1);
      goToTop();
      return;
    }
    // The first section of Practical goes back into the last section of
    // Theory, not to a disabled button — the two phases are one walk.
    if (phaseIndex > 0) {
      const previous = sectionsByPhase[phaseIndex - 1] ?? [];
      setPhaseIndex(phaseIndex - 1);
      setStepIndex(Math.max(previous.length - 1, 0));
      goToTop();
      return;
    }
    window.location.assign(backHref);
  }

  function jumpTo(targetPhaseIndex: number, targetStepIndex: number) {
    setPhaseIndex(targetPhaseIndex);
    setStepIndex(targetStepIndex);
    setJumpOpen(false);
    setGateWarning(null);
    setReviewing(false);
    goToTop();
  }

  function payloadFor(p: TpStepperPhase): SubmitAssessmentInput {
    const slice = state[p.instrumentId] ?? emptyPhaseState();
    return {
      traineeId,
      instrumentId: p.instrumentId,
      instrumentCode: p.code,
      slot,
      criteria: p.criteria.map((c) => ({ id: c.id, itemMax: c.itemMax })),
      items: p.criteria.map((c) => ({
        criterionId: c.id,
        score: slice.marks[c.id]!.score!,
        comment: slice.marks[c.id]?.comment ?? '',
      })),
      sectionComments: groupBySection(p.criteria).map((s) => ({
        sectionCode: s.code,
        comment: slice.sectionComments[s.code] ?? '',
      })),
      generalComment: slice.generalComment,
    };
  }

  async function handleSubmit() {
    const gaps = phases.flatMap((p) =>
      computeGaps(p.criteria, (state[p.instrumentId] ?? emptyPhaseState()).marks),
    );
    if (gaps.length > 0) {
      setGapsShown(true);
      goToTop();
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    // One statement per phase, in order, each through the same path the
    // single-instrument form uses. If any is queued the whole thing reads as
    // queued — the marks are safe on the phone either way, and telling a
    // supervisor "half sent" invites them to mark the other half again.
    let anyQueued = false;
    for (const p of phases) {
      const outcome = await submitPhase({
        key: keyFor(p.instrumentId),
        payload: payloadFor(p),
        traineeName,
        instrumentLabel: p.label,
      });
      if (outcome.kind === 'rejected') {
        setSubmitting(false);
        setSubmitError(`${p.label}: ${outcome.error}`);
        return;
      }
      if (outcome.kind === 'queued') anyQueued = true;
    }

    setSubmitting(false);
    if (anyQueued) {
      setQueued(true);
      return;
    }
    // A full navigation, not router.push: a client-side one fetches the
    // target route's payload from the server, which fails on signal that has
    // just dropped — at the worst possible moment, right after a submit.
    window.location.assign(backHref);
  }

  if (reviewing) {
    return (
      <ReviewScreen
        traineeName={traineeName}
        phases={phases}
        state={state}
        submitting={submitting}
        submitError={submitError}
        gapsShown={gapsShown}
        onBack={() => {
          setReviewing(false);
          setPhaseIndex(phases.length - 1);
          setStepIndex(Math.max((sectionsByPhase[phases.length - 1] ?? []).length - 1, 0));
        }}
        onJump={jumpTo}
        sectionsByPhase={sectionsByPhase}
        onSubmit={handleSubmit}
      />
    );
  }

  const jumpRows = section ? sectionJumpRows(sections, marks, stepIndex) : [];
  const nextLabel = !lastSection
    ? 'Next'
    : nextPhase
      ? `Continue to ${tpPhaseLabels(nextPhase.code).short}`
      : 'Review & confirm';

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

        <div className="mt-1 flex items-baseline justify-between gap-2">
          <span className="text-[17px] font-bold tracking-[-0.2px]">{phaseLabels.label}</span>
          <span className="text-[12px] text-[#5f6f7c]">
            Section {stepIndex + 1} of {sections.length} · {phase.maxTotal} pts total
          </span>
        </div>

        {/* Two bars, because they answer two different questions. The teal one
            is "how far through this lesson am I"; the amber one is "how far
            through this trainee's whole assessment am I", which is the one a
            supervisor plans their afternoon around. */}
        <div className="mt-2.5">
          <div className="h-1.5 overflow-hidden rounded-full bg-[#e6ecea]">
            <div
              className="h-full rounded-full bg-[#0d4a43] transition-[width]"
              style={{ width: `${phasePct}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-[#5f6f7c]">
              {phaseLabels.short} {phaseDone}/{phase.criteria.length}
            </span>
            <span className="text-[11px] font-semibold text-[#5f6f7c]">
              Whole assessment {overall.done} of {overall.total} · {overall.pct}%
            </span>
          </div>
          <div className="mt-1 h-[7px] overflow-hidden rounded-full bg-[#e6ecea]">
            <div
              className="h-full rounded-full transition-[width]"
              style={{
                width: `${overall.pct}%`,
                background: overall.pct === 100 ? '#1c7a5e' : '#a35c00',
              }}
            />
          </div>
        </div>

        <button
          type="button"
          aria-expanded={jumpOpen}
          onClick={() => setJumpOpen(!jumpOpen)}
          className="focus:outline-accent mt-2.5 min-h-11 w-full rounded-lg border border-[#ccd7d4] bg-white text-[13px] font-bold text-[#3c4c58] focus:outline focus:outline-[3px] focus:outline-offset-2"
        >
          {jumpOpen ? 'Hide ⌃' : 'Sections ⌄'}
        </button>

        {jumpOpen ? (
          <ul className="mt-2 flex max-h-[46vh] flex-col gap-1.5 overflow-y-auto pb-1">
            {jumpRows.map((row) => (
              <li key={row.code}>
                <button
                  type="button"
                  onClick={() => jumpTo(phaseIndex, row.index)}
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
          className="mx-4 mt-4 rounded-xl border border-l-4 border-[#f0d3ca] border-l-[#8a3a2a] bg-[#fdf1ee] p-4"
        >
          <p className="text-[13.5px] leading-relaxed text-[#7a3325]">{gateWarning}</p>
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
          className="focus:outline-accent min-h-[52px] flex-[1.4] rounded-xl bg-[#12665b] text-[15px] font-bold text-white focus:outline focus:outline-[3px] focus:outline-offset-2"
        >
          {nextLabel}
        </button>
      </div>
    </main>
  );
}

/**
 * The last page: what is about to be sent, per phase, with every unscored
 * criterion named if any remain.
 *
 * Deliberately shows raw subtotals and nothing else — no grade, no GPA, no
 * verdict. Those are computed in Postgres (AGENTS.md rule 3); printing a
 * client-side guess here, minutes before the real one is produced, is exactly
 * how two different numbers end up in front of a trainee.
 */
function ReviewScreen({
  traineeName,
  phases,
  state,
  sectionsByPhase,
  submitting,
  submitError,
  gapsShown,
  onBack,
  onJump,
  onSubmit,
}: {
  traineeName: string;
  phases: TpStepperPhase[];
  state: Record<string, PhaseState>;
  sectionsByPhase: ReturnType<typeof groupBySection>[];
  submitting: boolean;
  submitError: string | null;
  gapsShown: boolean;
  onBack: () => void;
  onJump: (phaseIndex: number, stepIndex: number) => void;
  onSubmit: () => void;
}) {
  const gaps = phases.flatMap((p, index) =>
    computeGaps(p.criteria, (state[p.instrumentId] ?? emptyPhaseState()).marks).map((gap) => ({
      ...gap,
      phaseIndex: index,
      phaseLabel: tpPhaseLabels(p.code).short,
      stepIndex: (sectionsByPhase[index] ?? []).findIndex(
        (s) => s.code === gap.criterion.sectionCode,
      ),
    })),
  );

  return (
    <main className="min-h-dvh bg-[#eceff0] pb-28">
      <div className="sticky top-0 z-10 border-b border-[#e1e9e6] bg-white px-4 pb-3 pt-3">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="text-teal-mid focus:outline-accent min-h-11 text-[14px] font-semibold focus:outline focus:outline-[3px] focus:outline-offset-2"
          >
            ‹ Back
          </button>
          <span className="text-[12px] font-semibold text-[#5b6b78]">{traineeName}</span>
        </div>
        <h1 className="mt-1 text-[19px] font-bold tracking-[-0.2px] text-neutral-900">
          Review &amp; confirm
        </h1>
      </div>

      {gapsShown && gaps.length > 0 ? (
        <div
          role="alert"
          className="mx-4 mt-4 rounded-xl border border-l-4 border-[#f0d3ca] border-l-[#8a3a2a] bg-[#fdf1ee] p-4"
        >
          <p className="text-[14px] font-bold text-[#7a3325]">
            {gaps.length} criteri{gaps.length === 1 ? 'on is' : 'a are'} still unscored
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[#7a3325]">
            An unscored criterion counts as zero, which would understate the trainee. Every one must
            be scored before this can be sent.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {gaps.map((gap) => (
              <button
                key={gap.criterion.id}
                type="button"
                onClick={() => onJump(gap.phaseIndex, Math.max(gap.stepIndex, 0))}
                className="focus:outline-accent flex min-h-11 items-center justify-between gap-3 rounded-lg border border-[#f0d3ca] bg-white px-3 py-2.5 text-left focus:outline focus:outline-[3px] focus:outline-offset-2"
              >
                <span className="text-[13.5px] font-semibold text-[#7a3325]">
                  {gap.phaseLabel} · {gap.criterion.sectionLabel} {gap.criterion.itemCode}
                </span>
                <span className="text-[12.5px] font-bold text-[#8a3a2a]">Go ›</span>
              </button>
            ))}
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

      <div className="flex flex-col gap-4 px-4 py-5">
        {phases.map((p, index) => {
          const slice = state[p.instrumentId] ?? emptyPhaseState();
          const sections = sectionsByPhase[index] ?? [];
          const scored = scoredCount(p.criteria, slice.marks);
          const subtotal = sections.reduce((sum, s) => sum + sectionSubtotal(s, slice.marks), 0);
          return (
            <section key={p.instrumentId} className="rounded-2xl border border-[#e1e9e6] bg-white">
              <div className="flex items-baseline justify-between gap-3 border-b border-[#f1f5f4] px-4 py-3.5">
                <span className="text-[15px] font-bold text-[#14232e]">
                  {tpPhaseLabels(p.code).label}
                </span>
                <span className="text-[15px] font-extrabold text-[#0d4a43]">
                  {subtotal} / {p.maxTotal}
                </span>
              </div>
              <div className="px-4 py-3">
                <p className="text-[12.5px] font-semibold text-[#5b6b78]">
                  {scored} of {p.criteria.length} criteria scored
                </p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {sections.map((s, sectionIndex) => (
                    <li key={s.code}>
                      <button
                        type="button"
                        onClick={() => onJump(index, sectionIndex)}
                        className="focus:outline-accent flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-[#e1e9e6] px-2.5 py-2 text-left focus:outline focus:outline-[3px] focus:outline-offset-2"
                      >
                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#3c4c58]">
                          {s.code}. {s.label}
                        </span>
                        <span className="shrink-0 text-[12.5px] font-bold text-[#0d4a43]">
                          {sectionSubtotal(s, slice.marks)} / {s.max}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          );
        })}

        <p className="text-[12.5px] leading-relaxed text-[#5f6f7c]">
          The mark, grade and Competent verdict are worked out by the College’s system from the
          scores above once this is sent — nothing on this screen is the official result.
        </p>
      </div>

      <div className="fixed bottom-0 left-0 right-0 flex gap-2.5 border-t border-[#e1e9e6] bg-[#eceff0] p-4">
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="focus:outline-accent min-h-[52px] flex-1 rounded-xl bg-[#12665b] text-[16px] font-bold text-white focus:outline focus:outline-[3px] focus:outline-offset-2 disabled:opacity-60"
        >
          {submitting ? 'Submitting…' : 'Submit assessment'}
        </button>
      </div>
    </main>
  );
}
