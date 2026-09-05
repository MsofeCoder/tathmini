'use client';

import { useState, useTransition } from 'react';
import { generateReport } from './actions';

/** Locked-result action from the trainee profile screen — generates the
 * VETA PDF server-side and hands the browser a short-lived signed URL to
 * navigate to, rather than returning the file through the action itself. */
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
        {pending ? 'Generating report…' : 'Download Result PDF'}
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-[13px] leading-relaxed text-[#8a3a2a]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
