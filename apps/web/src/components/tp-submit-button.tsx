'use client';

import { useEffect, useState } from 'react';
import { draftKey, loadDraft, type DraftState } from '@/lib/drafts';
import { navigateTo } from '@/lib/local/shell-navigation';
import { refreshReachability, useReachability } from '@/lib/local/use-reachable';
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
 *
 * WITH NO CONNECTION there is no Submit. Nothing replays a queue on reconnect
 * any more, so a Submit tapped in a workshop would leave two lessons' marks
 * sitting in a list nobody is watching while the supervisor walked away
 * believing the College had them. What is offered instead is the truth: both
 * lessons are already saved as a draft on this phone, and this is the screen
 * to come back to.
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
  const reachability = useReachability();
  const online = reachability === 'online';

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
          The connection went before this could be sent. Both lessons are stored on this phone —
          open Reports when you have signal and tap Send. Do not mark this trainee again.
        </p>
        <a
          href="/reports"
          className="focus:outline-accent mt-3 flex min-h-[44px] items-center justify-center rounded-xl border border-[#b8863a] bg-white text-[14px] font-semibold text-[#6b4400] focus:outline focus:outline-[3px] focus:outline-offset-2"
        >
          Go to Reports
        </a>
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
      void refreshReachability();
      setQueued(true);
      return;
    }
    // Was a reload, which is where the unpredictability came from: a reload
    // returns to whatever url the phone is on and reboots React, so the
    // screen went blank (the shell's first paint is route-independent),
    // re-read IndexedDB, rebuilt the Realtime socket, and only then redrew —
    // and where it landed depended on the url rather than on what had just
    // happened. This says where to go instead. Nothing needs reloading:
    // `useDeviceRows()` is a Dexie liveQuery, so the profile re-derives from
    // the submitted mark on its own.
    navigateTo(`/trainee/${traineeId}`, { replace: true });
  }

  // Waiting on the probe. Neither answer may be guessed: a Submit drawn for a
  // quarter of a second offline is a Submit somebody taps.
  if (reachability === 'checking') return <div className="mt-4 min-h-[52px]" aria-hidden="true" />;

  if (!online) {
    return (
      <div className="mt-4 rounded-xl border border-[#e0c39a] bg-[#fff8ec] px-4 py-3.5">
        <p className="text-[13px] font-bold text-[#7a5a12]">
          Both lessons are marked — saved as a draft
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[#5a4212]">
          There is no connection, so this cannot be submitted yet. Every score is held on this phone
          and nothing will be lost. Come back to this screen when you have signal and the Submit
          button will be here.
        </p>
      </div>
    );
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
