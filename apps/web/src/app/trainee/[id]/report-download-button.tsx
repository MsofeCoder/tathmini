'use client';

import { useState, useTransition } from 'react';
import { generateReport } from './actions';

/** Stores this supervisor's own VETA report from the trainee profile screen —
 * generates the PDF server-side, saves it to the private Storage bucket, and
 * hands the browser a short-lived signed URL to navigate to, rather than
 * returning the file through the action itself.
 *
 * Available as soon as this assessor's own instruments are all submitted; it
 * does not wait for the second assessor. */
export function ReportDownloadButton({ traineeId }: { traineeId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await generateReport(traineeId);
      if ('error' in result) {
        setError(result.error);
        return;
      }
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
        {pending ? 'Generating and storing…' : 'Submit report'}
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-[13px] leading-relaxed text-[#8a3a2a]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
