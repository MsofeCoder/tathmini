'use client';

import { useState, useTransition } from 'react';
import { generateReport } from './actions';
import type { EmailOutcome } from '@/lib/notifications/send';

/** Submits this supervisor's own VETA report from the trainee profile screen —
 * generates the PDF server-side, saves it to the private Storage bucket, sends
 * it to the trainee (TP) or the assessor (IPT), and hands the browser a
 * short-lived signed URL for the supervisor's own copy rather than returning
 * the file through the action itself.
 *
 * Available as soon as this assessor's own instruments are all submitted; it
 * does not wait for the second assessor. */
export function ReportDownloadButton({ traineeId }: { traineeId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<EmailOutcome | null>(null);

  function handleClick() {
    setError(null);
    setSent(null);
    startTransition(async () => {
      const result = await generateReport(traineeId);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      // Set the outcome BEFORE handing over the signed URL. The link carries a
      // Content-Disposition attachment, so the browser downloads without
      // leaving the page and this message stays on screen — which is the whole
      // point of one "Submit and Send" button: the supervisor must not walk
      // away from the workshop unsure whether the result actually went out.
      setSent(result.email);
      window.location.assign(result.url);
    });
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
      {error ? (
        <p role="alert" className="mt-2 text-[13px] leading-relaxed text-[#8a3a2a]">
          {error}
        </p>
      ) : null}
      {sent ? (
        <p
          role="status"
          className={`mt-2 text-[13px] leading-relaxed ${
            sent.status === 'sent' ? 'text-[#1c6650]' : 'text-[#8a3a2a]'
          }`}
        >
          {sent.status === 'sent'
            ? 'Report saved and sent.'
            : sent.status === 'skipped'
              ? `Report saved. Not e-mailed: ${sent.detail}`
              : `Report saved, but the e-mail did not go out: ${sent.detail}`}
        </p>
      ) : null}
    </div>
  );
}
