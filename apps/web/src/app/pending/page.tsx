'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { OutboxRecord, ReportDraftRecord } from '@/lib/db';
import { listQueued } from '@/lib/outbox';
import { describeAge, listReportDrafts, sortDraftsByAge } from '@/lib/report-drafts';

/**
 * The prototype's "Pending" tab — work finished on this phone that has not
 * reached the College yet.
 *
 * Two different kinds of waiting, kept visually apart because the supervisor
 * has to do opposite things about them:
 *
 * - QUEUED ASSESSMENTS send themselves. The only correct action is to do
 *   nothing, and above all not to mark that trainee again — `assessment_marks`
 *   is append-only, so a duplicate is permanent.
 * - HELD REPORTS wait for the supervisor. Nothing will ever send them on its
 *   own; that is the point of saving one.
 *
 * Client-rendered from IndexedDB on purpose: the whole reason something is
 * here is that the network failed or was declined, so a screen that needed the
 * network to describe its own backlog would be empty exactly when it matters.
 *
 * A count alone is not enough in the field. A supervisor who marked six
 * trainees in a dead zone needs to see WHICH six are safe, by name.
 */
export default function PendingPage() {
  const [records, setRecords] = useState<OutboxRecord[] | null>(null);
  const [drafts, setDrafts] = useState<ReportDraftRecord[] | null>(null);

  useEffect(() => {
    const refresh = () => {
      void listQueued().then(setRecords);
      void listReportDrafts().then((rows) => setDrafts(sortDraftsByAge(rows)));
    };
    refresh();
    // The drainer empties the queue in the background, so re-read when the tab
    // regains focus rather than showing work that has already sent.
    window.addEventListener('online', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('online', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  const heldReports = drafts ?? [];
  const queued = records ?? [];
  const nothingAtAll =
    records !== null && drafts !== null && queued.length === 0 && heldReports.length === 0;

  return (
    <main className="min-h-dvh bg-[#eceff0]">
      <div className="border-b border-[#e1e9e6] bg-white p-4">
        <h1 className="text-[21px] font-bold tracking-[-0.2px] text-neutral-900">Pending</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-[#5b6b78]">
          Work finished on this phone that has not reached the College yet.
        </p>
      </div>

      {nothingAtAll ? (
        <div className="p-4">
          <div className="rounded-2xl border border-[#dae3e0] bg-white p-5 text-center">
            <p className="text-[15px] font-bold text-[#1c6650]">Nothing pending</p>
            <p className="mt-2 text-[13px] leading-relaxed text-[#5b6b78]">
              Everything you have marked has reached the College, and no report is waiting to be
              sent.
            </p>
          </div>
        </div>
      ) : null}

      {heldReports.length > 0 ? (
        <section className="px-4 pt-4">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.5px] text-[#5b6b78]">
            Reports you have not sent
          </h2>
          <p className="mt-1.5 rounded-lg bg-[#fff8ec] px-3 py-2 text-[12.5px] font-semibold leading-relaxed text-[#7a5a12]">
            {heldReports.length === 1
              ? 'This report is'
              : `These ${heldReports.length} reports are`}{' '}
            waiting for you. Nothing sends them automatically — open the trainee and send when you
            are ready. Each will be dated the day you send it.
          </p>
          <ul className="mt-2.5 flex flex-col gap-2.5">
            {heldReports.map((draft) => (
              <li
                key={draft.key}
                className="rounded-2xl border border-[#e0c39a] bg-[#fff8ec] p-3.5"
              >
                <p className="text-[15px] font-semibold text-[#14232e]">{draft.traineeName}</p>
                <p className="mt-0.5 text-[12.5px] text-[#7a5a12]">
                  Saved as a draft {describeAge(draft.savedAt)}
                </p>
                {draft.note ? (
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#5a4212]">
                    {draft.note}
                  </p>
                ) : null}
                <Link
                  href={`/trainee/${draft.key}`}
                  className="focus:outline-accent mt-2.5 flex min-h-[44px] items-center justify-center rounded-xl border border-[#12665b] bg-white text-[14px] font-semibold text-[#12665b] focus:outline focus:outline-[3px] focus:outline-offset-2"
                >
                  Open and send
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {queued.length > 0 ? (
        <section className="px-4 pt-4">
          {heldReports.length > 0 ? (
            <h2 className="text-[13px] font-bold uppercase tracking-[0.5px] text-[#5b6b78]">
              Assessments still sending
            </h2>
          ) : null}
          <p className="mt-1.5 rounded-lg bg-[#fffaf0] px-3 py-2 text-[12.5px] font-semibold leading-relaxed text-[#6b4400]">
            {queued.length} {queued.length === 1 ? 'assessment is' : 'assessments are'} waiting.
            They send themselves when there is signal — you do not need to do anything, and you must
            not mark these trainees again.
          </p>
          <ul className="mt-2.5 flex flex-col gap-2.5 pb-4">
            {queued.map((record) => (
              <li
                key={record.key}
                className="rounded-2xl border border-[#f0dcb4] bg-[#fffaf0] p-3.5"
              >
                <p className="text-[15px] font-semibold text-[#14232e]">{record.traineeName}</p>
                <p className="mt-0.5 text-[13px] text-[#6b4400]">{record.instrumentLabel}</p>
                <p className="mt-1.5 text-[12px] text-[#5f6f7c]">
                  Marked {new Date(record.queuedAt).toLocaleString()}
                </p>
                {record.attempts > 0 ? (
                  <p className="mt-1.5 text-[12px] leading-relaxed text-[#8a3a2a]">
                    {record.attempts} send {record.attempts === 1 ? 'attempt' : 'attempts'} so far —
                    still saved here, nothing is lost.
                    {record.lastError ? ` Last error: ${record.lastError}` : ''}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
