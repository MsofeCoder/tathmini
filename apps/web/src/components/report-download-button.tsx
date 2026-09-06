'use client';

import { useState } from 'react';
import type { EmailOutcome } from '@/lib/notifications/send';
import type { GenerateReportResult } from '@/lib/reports/generate';
import { isReachable } from '@/lib/reachability';
import { enqueueReport, removeQueuedReport } from '@/lib/report-outbox';

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
 * Submits this supervisor's own VETA report: generates the PDF server-side,
 * stores it, sends it to the trainee (TP) or the assessor (IPT), and hands
 * the browser a short-lived signed URL for their own copy.
 *
 * This is the one control on the profile that genuinely needs the network —
 * the report is rendered by headless Chromium and handed to SMTP, neither of
 * which exists on a phone. So it is also the place where "offline by default"
 * has to be explicit rather than implicit:
 *
 *   1. **Queue first, always.** The instruction is written to IndexedDB
 *      before anything is attempted, so it survives the tab closing, the
 *      battery dying, or a connection that never comes.
 *   2. **Then check whether the server is actually reachable** — a real
 *      probe, not `navigator.onLine`, which is true on a workshop wifi that
 *      routes nowhere.
 *   3. **Send if it is; leave it queued if it is not.** OutboxDrainer sends
 *      it on its own later, from whatever screen the supervisor is on.
 *
 * On a send that succeeds the entry is REMOVED from the queue, and that line
 * is not housekeeping. `generateAndSendReport` has no server-side "already
 * sent" guard — there is no unique index on `reports` — so an entry left
 * behind is picked up by the next drain and the trainee receives a second
 * copy of their result. (The previous offline screen enqueued and never
 * removed on success; this is where that was fixed.)
 *
 * Once sent, the control is REPLACED rather than disabled. Sending is
 * irreversible and outward-facing, and a disabled button still invites the
 * tap that a slow connection makes tempting.
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

  const done = state === 'sent' || !!alreadySentAt;

  async function handleClick() {
    if (state === 'working' || done) return;
    setError(null);
    setState('working');

    // Durable first. Everything after this can fail without losing the
    // instruction.
    await enqueueReport({ traineeId, traineeName });

    if (!(await isReachable())) {
      setState('queued');
      return;
    }

    let result: GenerateReportResult;
    try {
      // The route handler, not the Server Action: this page is static and
      // client-rendered, so an action invoked from it inherits the platform's
      // default budget — which a headless Chromium cold start alone exceeds.
      // The handler carries its own 60 seconds.
      const response = await fetch(`/api/reports/${traineeId}`, { method: 'POST' });
      if (!response.ok) {
        setState('queued');
        return;
      }
      result = (await response.json()) as GenerateReportResult;
    } catch {
      // The probe said reachable and the request still failed. It stays
      // queued, which is the whole point of having queued it first.
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

    // Stored and sent. Drop the instruction before anything else, so no later
    // drain can send a second copy.
    await removeQueuedReport(traineeId);
    setSent(result.email);
    setState('sent');
    // The link carries a Content-Disposition attachment, so the browser
    // downloads without leaving the page and this stays on screen. A
    // supervisor must not walk away from a workshop unsure whether the result
    // actually went out.
    window.location.assign(result.url);
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

        {/* The next thing a supervisor needs is the next trainee, not this
            screen. Offering it here is what stops them tapping back into the
            send control looking for a way onward. */}
        <a
          href="/home"
          className="focus:outline-accent bg-teal-mid mt-3 flex min-h-[48px] items-center justify-center rounded-xl text-[15px] font-semibold text-white focus:outline focus:outline-[3px] focus:outline-offset-2"
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
          It is saved on this phone and goes on its own as soon as there is a connection — you do
          not need to come back to this screen.
        </p>
        {error ? (
          <p role="alert" className="mt-2 text-[12.5px] leading-relaxed text-[#7a3325]">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={state === 'working'}
        className="bg-teal-mid focus:outline-accent min-h-[48px] w-full rounded-xl text-[15px] font-semibold text-white focus:outline focus:outline-[3px] focus:outline-offset-2 disabled:opacity-70"
      >
        {state === 'working' ? 'Submitting and sending…' : 'Submit and send report'}
      </button>
      <p className="mt-2 text-[12.5px] leading-relaxed text-[#5f6f7c]">
        This stores the report and e-mails it. It can only be done once.
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
