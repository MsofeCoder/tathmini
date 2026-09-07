'use client';

import { useEffect, useState } from 'react';
import { draftKey, loadDraft, type DraftState } from '@/lib/drafts';
import { submitTpAssessment } from '@/lib/submit-phase';
import { tpReadyToSubmit, type TpSubmitPhase } from '@/lib/tp-submit';

/**
 * "Submit TP assessment", on the pre-assessment page.
 *
 * Theory and Practical are marked separately and each one ends by saving and
 * coming back here. Something has to notice that the pair is now finished,
 * and this is it: it reads the drafts this phone holds for every phase still
 * to be submitted, and appears only when every criterion of every one of them
 * carries a score.
 *
 * The same condition and the same send are used by the last page of the
 * stepper (`lib/tp-submit.ts`), so a supervisor who finishes the second
 * lesson can send from where they are standing, and one who left the phone in
 * a bag until the evening can send from here. Neither can send half an
 * assessment, and neither computes a total.
 *
 * Reads the device only — the drafts are in the same Dexie `drafts` store
 * they have always been in, keyed per (trainee, instrument). No store, no
 * version, no network.
 */
export function TpSubmitButton({
  traineeId,
  traineeName,
  slot,
  phases,
}: {
  traineeId: string;
  traineeName: string;
  slot: 'a1' | 'a2';
  phases: TpSubmitPhase[];
}) {
  const [drafts, setDrafts] = useState<Record<string, DraftState | undefined> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      phases.map(
        async (p) =>
          [p.instrumentId, await loadDraft(draftKey(traineeId, p.instrumentId))] as const,
      ),
    ).then((loaded) => {
      if (!cancelled) setDrafts(Object.fromEntries(loaded));
    });
    return () => {
      cancelled = true;
    };
  }, [traineeId, phases]);

  if (queued) {
    return (
      <div className="mt-4 rounded-xl border border-[#f0dcb4] bg-[#fffaf0] px-4 py-3.5">
        <p className="text-[13px] font-bold text-[#6b4400]">Waiting to send</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[#6b4400]">
          There is no signal right now. Both lessons are stored on this phone and will send
          themselves when there is a connection — you do not need to mark this trainee again.
        </p>
      </div>
    );
  }

  // Still reading, or not finished. An always-visible disabled Submit would
  // read as a broken button on a trainee whose second lesson has not been
  // watched yet.
  if (!drafts || !tpReadyToSubmit(phases, drafts)) return null;

  async function handleSubmit() {
    if (!drafts) return;
    setSubmitting(true);
    setError(null);
    const result = await submitTpAssessment({ traineeId, traineeName, slot, phases, drafts });
    setSubmitting(false);
    if (result.kind === 'rejected') {
      setError(result.error);
      return;
    }
    if (result.kind === 'incomplete') {
      setError('Some criteria are still unscored. Every criterion must carry a score.');
      return;
    }
    if (result.kind === 'queued') {
      setQueued(true);
      return;
    }
    window.location.reload();
  }

  return (
    <div className="mt-4 rounded-xl border border-[#d5e6df] bg-[#f1f6f4] px-4 py-3.5">
      <p className="text-[13px] font-bold text-[#1c6650]">Both lessons are marked</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-[#40614f]">
        Every criterion carries a score. Sending stores your marks at the College — they cannot be
        edited afterwards without an Administrator override.
      </p>
      {error ? (
        <p role="alert" className="mt-2 text-[13px] font-semibold text-[#7a3325]">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={submitting}
        className="focus:outline-accent mt-3 flex min-h-[52px] w-full items-center justify-center rounded-xl bg-[#12665b] text-[15px] font-bold text-white focus:outline focus:outline-[3px] focus:outline-offset-2 disabled:opacity-60"
      >
        {submitting ? 'Submitting…' : 'Submit TP assessment'}
      </button>
    </div>
  );
}
