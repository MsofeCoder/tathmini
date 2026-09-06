'use client';

import { useEffect, useState, useTransition } from 'react';
import { generateReport } from './actions';
import { getReportDownloadUrl } from './download-actions';
import {
  describeAge,
  getReportDraft,
  removeReportDraft,
  saveReportDraft,
} from '@/lib/report-drafts';
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
 * Everything a supervisor does with their own report: hold it back, send it,
 * and afterwards take a copy.
 *
 * SAVING A DRAFT stores no document — only the fact that this one is finished
 * and waiting. The PDF is rendered when they send, which is what makes the
 * date on the page the date they actually submitted it rather than the day
 * they set it aside. It is kept on the device, so the decision survives with
 * no signal, which is when it usually gets made.
 *
 * SENDING is still irreversible and still replaces its own control rather than
 * disabling it: a second tap posts a second copy of a trainee's result to
 * their inbox, and a disabled button invites exactly the tap a slow connection
 * makes tempting.
 *
 * DOWNLOADING signs the stored file again. Nothing is regenerated, so the copy
 * is byte-for-byte what was e-mailed, carrying its original submission date —
 * a report downloaded next month is not silently re-dated to next month.
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
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<EmailOutcome | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [draftChecked, setDraftChecked] = useState(false);

  const done = sent !== null || !!alreadySentAt;

  // IndexedDB is not readable on the server, so the held-back state arrives
  // after the first paint. Until it does, neither the draft banner nor the
  // send button is shown — offering "Save as draft" for a quarter of a second
  // to someone who already saved one is worse than a beat of nothing.
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

  function handleSend() {
    if (pending || done) return;
    setError(null);
    startTransition(async () => {
      const result = await generateReport(traineeId);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      // The held-back marker has served its purpose the moment the report is
      // away; leaving it would list a sent report as still waiting.
      await removeReportDraft(traineeId);
      setDraftSavedAt(null);
      // Set the outcome BEFORE handing over the signed URL: the link carries a
      // Content-Disposition attachment, so the browser downloads without
      // leaving the page and this stays on screen. A supervisor must not walk
      // away from a workshop unsure whether the result actually went out.
      setSent(result.email);
      window.location.assign(result.url);
    });
  }

  function handleSaveDraft() {
    if (pending || done) return;
    setError(null);
    startTransition(async () => {
      await saveReportDraft({ traineeId, traineeName });
      setDraftSavedAt(Date.now());
    });
  }

  function handleDiscardDraft() {
    startTransition(async () => {
      await removeReportDraft(traineeId);
      setDraftSavedAt(null);
    });
  }

  function handleDownload() {
    setError(null);
    startTransition(async () => {
      const result = await getReportDownloadUrl(traineeId);
      if ('error' in result) {
        setError(result.error);
        return;
      }
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

        <button
          type="button"
          onClick={handleDownload}
          disabled={pending}
          className="focus:outline-accent mt-3 flex min-h-[48px] w-full items-center justify-center rounded-xl border border-[#12665b] bg-white text-[15px] font-semibold text-[#12665b] focus:outline focus:outline-[3px] focus:outline-offset-2 disabled:opacity-70"
        >
          {pending ? 'Preparing your copy…' : 'Download my copy'}
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

  if (!draftChecked) {
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

        <button
          type="button"
          onClick={handleSend}
          disabled={pending}
          className="bg-teal-mid focus:outline-accent mt-3 min-h-[48px] w-full rounded-xl text-[15px] font-semibold text-white focus:outline focus:outline-[3px] focus:outline-offset-2 disabled:opacity-70"
        >
          {pending ? 'Submitting and sending…' : 'Send it now'}
        </button>

        <button
          type="button"
          onClick={handleDiscardDraft}
          disabled={pending}
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
      <button
        type="button"
        onClick={handleSend}
        disabled={pending}
        className="bg-teal-mid focus:outline-accent min-h-[48px] w-full rounded-xl text-[15px] font-semibold text-white focus:outline focus:outline-[3px] focus:outline-offset-2 disabled:opacity-70"
      >
        {pending ? 'Submitting and sending…' : 'Submit and send report'}
      </button>

      <button
        type="button"
        onClick={handleSaveDraft}
        disabled={pending}
        className="focus:outline-accent mt-2 min-h-[48px] w-full rounded-xl border border-[#ccd7d4] bg-white text-[15px] font-semibold text-[#3c4c58] focus:outline focus:outline-[3px] focus:outline-offset-2 disabled:opacity-70"
      >
        Save as a draft and send later
      </button>

      <p className="mt-2 text-[12.5px] leading-relaxed text-[#5f6f7c]">
        Sending stores the report and e-mails it, and can only be done once. Saving a draft sends
        nothing — it keeps this report on your Pending list until you are ready, and the report will
        be dated the day you send it.
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
