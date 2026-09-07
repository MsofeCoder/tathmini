'use client';

import { useEffect, useState } from 'react';
import type { EmailOutcome } from '@/lib/notifications/send';
import type { GenerateReportResult } from '@/lib/reports/generate';
import { getReportDownloadUrl } from '@/app/trainee/[id]/download-actions';
import { isReachable } from '@/lib/reachability';
import { refreshReachability, useReachability } from '@/lib/local/use-reachable';
import { enqueueReport, removeQueuedReport } from '@/lib/report-outbox';
import { recordSentReport } from '@/lib/sent-reports';
import {
  describeAge,
  getReportDraft,
  removeReportDraft,
  saveReportDraft,
} from '@/lib/report-drafts';

/** Formatted on a fixed locale and the College's own timezone so every phone
 * renders the same characters regardless of how it is configured. */
const SENT_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Africa/Dar_es_Salaam',
});

/**
 * Everything a supervisor does with their own VETA report: hold it back, send
 * it, and afterwards take a copy.
 *
 * SAVING A DRAFT stores no document — only the fact that this one is finished
 * and waiting. The PDF is rendered when they send, which is what makes the
 * date on the page the date they actually submitted rather than the day they
 * set it aside. It lives on the device, so the decision survives with no
 * signal, which is when it usually gets made.
 *
 * SENDING is the one control on this screen that genuinely needs the network —
 * the report is rendered by headless Chromium and handed to SMTP, neither of
 * which exists on a phone. So it is also where "offline by default" has to be
 * explicit rather than implicit:
 *
 *   1. **Queue first, always.** The instruction is written to IndexedDB before
 *      anything is attempted, so it survives the tab closing, the battery
 *      dying, or a connection that never comes.
 *   2. **Then check whether the server is actually reachable** — a real probe,
 *      not `navigator.onLine`, which is true on a workshop wifi that routes
 *      nowhere.
 *   3. **Send if it is; leave it queued if it is not.** Nothing drains that
 *      queue on its own any more — the supervisor sends it from the Reports
 *      screen when they next have signal (lib/send-pending.ts).
 *
 * On a send that succeeds the entry is REMOVED from the queue, and that line
 * is not housekeeping. `generateAndSendReport` has no server-side "already
 * sent" guard — there is no unique index on `reports` — so an entry left
 * behind is picked up by the next drain and the trainee receives a second copy
 * of their result.
 *
 * Once sent, the control is REPLACED rather than disabled — here AND on every
 * later visit to the trainee. `alreadySentAt` now comes from this phone's own
 * send receipt as well as the server's replicated `reports` row
 * (lib/local/derive.ts `reportSentAt`), which is what stopped this screen
 * offering the whole send flow again to a supervisor who walked back into a
 * trainee they had already submitted. Sending is irreversible and
 * outward-facing, and a disabled button still invites the tap that a slow
 * connection makes tempting.
 *
 * WITH NO CONNECTION there is no send control at all, only "Save as a draft".
 * The app stopped sending anything by itself, so an offered Submit that
 * quietly lands in a queue nobody drains is a supervisor walking away
 * believing a result went out. Offline the honest offer is the draft; the
 * Reports screen is where drafts and queued work are sent by hand.
 *
 * DOWNLOADING signs the stored file again. Nothing is regenerated, so the copy
 * is byte-for-byte what was e-mailed, carrying its original submission date — a
 * report downloaded next month is not silently re-dated to next month.
 */
export function ReportDownloadButton({
  traineeId,
  traineeName,
  alreadySentAt,
}: {
  traineeId: string;
  traineeName: string;
  alreadySentAt?: string | null;
}) {
  const [state, setState] = useState<'idle' | 'working' | 'queued' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<EmailOutcome | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [draftChecked, setDraftChecked] = useState(false);
  /** Kept out of `state`: taking a copy of an already-sent report is not a
   * step in the send machine, and folding it in there would let a download
   * spinner read as "submitting". */
  const [downloading, setDownloading] = useState(false);

  const reachability = useReachability();
  const done = state === 'sent' || !!alreadySentAt;
  const busy = state === 'working';
  const online = reachability === 'online';

  // The held-back state is on the device, so it arrives after the first paint.
  // Until it does, neither the draft banner nor the send button is shown —
  // offering "Save as a draft" for a quarter of a second to someone who
  // already saved one is worse than a beat of nothing.
  useEffect(() => {
    let live = true;
    void getReportDraft(traineeId).then((draft) => {
      if (!live) return;
      setDraftSavedAt(draft?.savedAt ?? null);
      setDraftChecked(true);
    });
    return () => {
      live = false;
    };
  }, [traineeId]);

  async function handleSend() {
    if (busy || done) return;
    setError(null);
    setState('working');

    // Durable first. Everything after this can fail without losing the
    // instruction.
    await enqueueReport({ traineeId, traineeName });

    // The report has stopped being "held back by a person" the moment they
    // press send — it is now the machine's job. Clearing the marker here, not
    // on success, is what keeps the Pending screen honest for a supervisor who
    // pressed send with no signal.
    //
    // Deliberately AFTER the enqueue: if the tab dies between the two, the
    // report is queued and merely mislabelled. The other order would lose it
    // from both lists.
    await removeReportDraft(traineeId);
    setDraftSavedAt(null);

    if (!(await isReachable())) {
      setState('queued');
      return;
    }

    let result: GenerateReportResult;
    try {
      // The route handler, not a Server Action. A Server Action invoked from
      // the shell posts to the shell's own url and inherits the platform's
      // default budget — which a headless Chromium cold start alone exceeds.
      // That is the bug that silently lost every report queued offline
      // (e192009); the handler carries its own 60 seconds.
      const response = await fetch(`/api/reports/${traineeId}`, { method: 'POST' });
      if (!response.ok) {
        void refreshReachability();
        setState('queued');
        return;
      }
      result = (await response.json()) as GenerateReportResult;
    } catch {
      // The probe said reachable and the request still failed. It stays
      // queued, which is the whole point of having queued it first — and the
      // fastest way to learn the connection died is to have just tried to use
      // it, so the banner and every send button are told immediately.
      void refreshReachability();
      setState('queued');
      return;
    }

    if ('error' in result) {
      // Left queued deliberately: the usual cause is that the marks have not
      // drained yet, which the next pass fixes on its own.
      setError(result.error);
      setState('queued');
      return;
    }

    // Stored and sent. The receipt goes in BEFORE the queue entry comes out,
    // so a failure between the two leaves the report queued rather than
    // vanished — and it is what lets the Reports screen say "this one went"
    // later, standing in a dead zone, before the server's own row has synced.
    await recordSentReport({ traineeId, traineeName });
    await removeQueuedReport(traineeId);
    // Set the outcome BEFORE handing over the signed URL: the link carries a
    // Content-Disposition attachment, so the browser downloads without leaving
    // the page and this stays on screen. A supervisor must not walk away from
    // a workshop unsure whether the result actually went out.
    setSent(result.email);
    setState('sent');
    window.location.assign(result.url);
  }

  async function handleSaveDraft() {
    if (busy || done) return;
    setError(null);
    setState('working');
    await saveReportDraft({ traineeId, traineeName });
    setDraftSavedAt(Date.now());
    setState('idle');
  }

  async function handleDiscardDraft() {
    if (busy) return;
    setState('working');
    await removeReportDraft(traineeId);
    setDraftSavedAt(null);
    setState('idle');
  }

  async function handleDownload() {
    if (downloading) return;
    setError(null);
    setDownloading(true);
    try {
      // A Server Action is right here where it was wrong for sending: this
      // only signs a file that already exists, so it answers in well under a
      // second and never needs a Chromium budget.
      const result = await getReportDownloadUrl(traineeId);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      window.location.assign(result.url);
    } finally {
      setDownloading(false);
    }
  }

  if (done) {
    return (
      <div className="mt-3 rounded-xl border border-[#cfe3d8] bg-[#f1f8f4] p-3.5">
        <p className="text-[14px] font-bold text-[#1c6650]">
          {sent?.status === 'failed' ? 'Report saved' : 'Report saved and sent ✓'}
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[#3c4c58]">
          {doneDetail(sent, alreadySentAt)}
        </p>

        <button
          type="button"
          onClick={() => void handleDownload()}
          disabled={downloading}
          className="focus:outline-accent mt-3 flex min-h-[48px] w-full items-center justify-center rounded-xl border border-[#12665b] bg-white text-[15px] font-semibold text-[#12665b] focus:outline focus:outline-[3px] focus:outline-offset-2 disabled:opacity-70"
        >
          {downloading ? 'Preparing your copy…' : 'Download my copy'}
        </button>

        {error ? (
          <p role="alert" className="mt-2 text-[13px] leading-relaxed text-[#8a3a2a]">
            {error}
          </p>
        ) : null}

        {/* The next thing a supervisor needs is the next trainee, not this
            screen. Offering it here is what stops them tapping back into the
            send control looking for a way onward. */}
        <a
          href="/home"
          className="focus:outline-accent bg-teal-mid mt-2.5 flex min-h-[48px] items-center justify-center rounded-xl text-[15px] font-semibold text-white focus:outline focus:outline-[3px] focus:outline-offset-2"
        >
          Back to my route
        </a>
      </div>
    );
  }

  if (state === 'queued') {
    return (
      <div className="mt-3 rounded-xl border border-[#f0dcb4] bg-[#fffaf0] p-3.5">
        <p className="text-[14px] font-bold text-[#6b4400]">Report waiting to send</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[#6b4400]">
          It is saved on this phone. Nothing sends on its own — when you have a connection, open
          Reports, go to Pending and tap Send. Do not mark this trainee again.
        </p>
        <a
          href="/reports"
          className="focus:outline-accent mt-3 flex min-h-[44px] items-center justify-center rounded-xl border border-[#b8863a] bg-white text-[14px] font-semibold text-[#6b4400] focus:outline focus:outline-[3px] focus:outline-offset-2"
        >
          Go to Reports
        </a>
        {error ? (
          <p role="alert" className="mt-2 text-[12.5px] leading-relaxed text-[#7a3325]">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  // Two things have to be known before anything is offered: whether a draft is
  // already held, and whether there is a connection. Both arrive after the
  // first paint, and getting either wrong changes what the supervisor is
  // invited to do — a Submit shown for a quarter of a second offline is a
  // Submit somebody taps.
  if (!draftChecked || reachability === 'checking') {
    return <div className="mt-3 min-h-[48px]" aria-hidden="true" />;
  }

  if (draftSavedAt !== null) {
    return (
      <div className="mt-3 rounded-xl border border-[#e0c39a] bg-[#fff8ec] p-3.5">
        <p className="text-[14px] font-bold text-[#7a5a12]">Saved as a draft</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[#5a4212]">
          Held on this phone since {describeAge(draftSavedAt)}. Nothing has been sent yet. The date
          on the report will be the day you send it, not today.
        </p>

        {online ? (
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={busy}
            className="bg-teal-mid focus:outline-accent mt-3 min-h-[48px] w-full rounded-xl text-[15px] font-semibold text-white focus:outline focus:outline-[3px] focus:outline-offset-2 disabled:opacity-70"
          >
            {busy ? 'Submitting and sending…' : 'Send it now'}
          </button>
        ) : (
          /* No send control at all without a connection. The draft is already
             saved, so there is nothing to lose and nothing to press — saying
             so is more use than a button that would queue the report into a
             list nothing drains. */
          <p className="mt-3 rounded-lg bg-[#fff2d8] px-3 py-2.5 text-[13px] font-semibold leading-relaxed text-[#6b4400]">
            No connection. This draft stays on the phone — come back to this screen when you have
            signal and the Send button will be here.
          </p>
        )}

        <button
          type="button"
          onClick={() => void handleDiscardDraft()}
          disabled={busy}
          className="focus:outline-accent mt-2 min-h-[44px] w-full rounded-xl border border-[#d9c49c] bg-white text-[14px] font-semibold text-[#7a5a12] focus:outline focus:outline-[3px] focus:outline-offset-2 disabled:opacity-70"
        >
          Discard the draft
        </button>
        <p className="mt-1.5 text-[12px] leading-relaxed text-[#5a4212]">
          Discarding removes the reminder only. Your marks are already submitted and are not
          affected.
        </p>

        {error ? (
          <p role="alert" className="mt-2 text-[13px] leading-relaxed text-[#8a3a2a]">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-3">
      {/* Online: both choices. Offline: the draft only. Which of the two a
          supervisor sees is the whole of the offline contract now — the app
          sends nothing by itself, so anything it offers has to be something it
          can actually do while they are standing there. */}
      {online ? (
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={busy}
          className="bg-teal-mid focus:outline-accent min-h-[48px] w-full rounded-xl text-[15px] font-semibold text-white focus:outline focus:outline-[3px] focus:outline-offset-2 disabled:opacity-70"
        >
          {busy ? 'Submitting and sending…' : 'Submit and send report'}
        </button>
      ) : (
        <p className="rounded-lg bg-[#fff2d8] px-3 py-2.5 text-[13px] font-semibold leading-relaxed text-[#6b4400]">
          No connection, so the report cannot be sent yet. Save it as a draft — it waits on this
          phone, and you send it from this screen or from Reports once you have signal.
        </p>
      )}

      <button
        type="button"
        onClick={() => void handleSaveDraft()}
        disabled={busy}
        className={`focus:outline-accent min-h-[48px] w-full rounded-xl text-[15px] font-semibold focus:outline focus:outline-[3px] focus:outline-offset-2 disabled:opacity-70 ${
          online
            ? 'mt-2 border border-[#ccd7d4] bg-white text-[#3c4c58]'
            : 'bg-teal-mid mt-3 text-white'
        }`}
      >
        {online ? 'Save as a draft and send later' : 'Save as a draft'}
      </button>

      <p className="mt-2 text-[12.5px] leading-relaxed text-[#5f6f7c]">
        {online
          ? 'Sending stores the report and e-mails it, and can only be done once. Saving a draft sends nothing — it keeps this report on the Drafted list in your Reports tab until you are ready, and the report will be dated the day you send it.'
          : 'A draft sends nothing and nothing sends on its own. It keeps this report on the Drafted list in your Reports tab until you open it and send it yourself, and the report will be dated the day you send it.'}
      </p>
      {error ? (
        <p role="alert" className="mt-2 text-[13px] leading-relaxed text-[#8a3a2a]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Says plainly what happened, including when the e-mail did not go — the
 * report is stored either way, and a supervisor told only "saved" would
 * reasonably try again. */
function doneDetail(sent: EmailOutcome | null, alreadySentAt?: string | null): string {
  if (sent?.status === 'skipped') {
    return `The report is stored. It was not e-mailed: ${sent.detail}`;
  }
  if (sent?.status === 'failed') {
    return `The report is stored, but the e-mail did not go out: ${sent.detail} Tell the Coordinator rather than submitting again — the report itself is safe.`;
  }
  if (sent?.status === 'sent') {
    return 'The report has been stored and e-mailed. There is nothing more to do for this trainee.';
  }
  return alreadySentAt
    ? `You submitted this report on ${SENT_DATE.format(new Date(alreadySentAt))}. It has already been sent — you do not need to send it again.`
    : 'The report has been stored and sent.';
}
