'use client';

import { useEffect, useState } from 'react';
import type { OutboxRecord } from '@/lib/db';
import { listQueued } from '@/lib/outbox';

/**
 * The prototype's "Pending" tab — completed assessments that have not reached
 * the server yet.
 *
 * Client-rendered from IndexedDB on purpose: the whole reason something is
 * here is that the network failed, so a screen that needed the network to
 * describe its own backlog would be empty exactly when it is needed. It also
 * means this page works unchanged offline.
 *
 * A count alone is not enough in the field. A supervisor who marked six
 * trainees in a dead zone needs to see WHICH six are safe, by name —
 * otherwise they reasonably conclude the work was lost and mark somebody a
 * second time, and assessment_marks is append-only, so that duplicate is
 * permanent.
 */
export default function PendingPage() {
  const [records, setRecords] = useState<OutboxRecord[] | null>(null);

  useEffect(() => {
    void listQueued().then(setRecords);
    // The drainer empties this queue in the background, so re-read when the
    // tab regains focus rather than showing work that has already sent.
    const refresh = () => void listQueued().then(setRecords);
    window.addEventListener('online', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('online', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  return (
    <main className="min-h-dvh bg-[#eceff0]">
      <div className="border-b border-[#e1e9e6] bg-white p-4">
        <h1 className="text-[21px] font-bold tracking-[-0.2px] text-neutral-900">Pending</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-[#5b6b78]">
          Assessments finished on this phone that have not reached the College yet.
        </p>
      </div>

      {records === null ? null : records.length === 0 ? (
        <div className="p-4">
          <div className="rounded-2xl border border-[#dae3e0] bg-white p-5 text-center">
            <p className="text-[15px] font-bold text-[#1c6650]">Nothing pending</p>
            <p className="mt-2 text-[13px] leading-relaxed text-[#5b6b78]">
              Everything you have marked has reached the College.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="px-4 pt-4">
            <p className="rounded-lg bg-[#fffaf0] px-3 py-2 text-[12.5px] font-semibold leading-relaxed text-[#6b4400]">
              {records.length} {records.length === 1 ? 'assessment is' : 'assessments are'} waiting.
              They send themselves when there is signal — you do not need to do anything, and you
              must not mark these trainees again.
            </p>
          </div>
          <ul className="flex flex-col gap-2.5 p-4">
            {records.map((record) => (
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
        </>
      )}
    </main>
  );
}
