'use client';

import { useState, useTransition } from 'react';
import { generateReport } from './actions';
import type { EmailOutcome } from '@/lib/notifications/send';

/** Formatted on a fixed locale and the College's own timezone so the server
 * and the client render the same characters — a date formatted from the
 * viewer's locale would differ between the two and hydrate mismatched. */
const SENT_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Africa/Dar_es_Salaam',
});

/**
 * Submits this supervisor's own VETA report — generates the PDF server-side,
 * stores it, sends it to the trainee (TP) or the assessor (IPT), and hands the
 * browser a short-lived signed URL for the supervisor's own copy.
 *
 * Once sent, the control is REPLACED rather than merely disabled. Sending is
 * irreversible and outward-facing: a second tap posts a second copy of a
 * trainee's result to their inbox. A disabled button still invites the tap
 * that a slow connection makes tempting; removing it entirely, and replacing
 * it with the next thing the supervisor actually needs, is what stops it.
 *
 * `alreadySentAt` comes from the server for the same reason — this
 * component's own state dies on a reload, and a supervisor who refreshes
 * after sending must not be offered the button again.
 */
export function ReportDownloadButton({
  traineeId,
  alreadySentAt,
}: {
  traineeId: string;
  alreadySentAt?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<EmailOutcome | null>(null);

  const done = sent !== null || !!alreadySentAt;

  function handleClick() {
    if (pending || done) return;
    setError(null);
    startTransition(async () => {
      const result = await generateReport(traineeId);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      // Set the outcome BEFORE handing over the signed URL: the link carries a
      // Content-Disposition attachment, so the browser downloads without
      // leaving the page and this stays on screen. A supervisor must not walk
      // away from a workshop unsure whether the result actually went out.
      setSent(result.email);
      window.location.assign(result.url);
    });
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

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="bg-teal-mid focus:outline-accent min-h-[48px] w-full rounded-xl text-[15px] font-semibold text-white focus:outline focus:outline-[3px] focus:outline-offset-2 disabled:opacity-70"
      >
        {pending ? 'Submitting and sending…' : 'Submit and send report'}
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
 * report is stored either way, and a supervisor who is told only "saved" would
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
