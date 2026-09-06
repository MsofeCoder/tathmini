'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ReportPreviewButton } from '@/components/report-preview';
import { loadOfflineBundle } from '@/lib/offline-cache';
import { listQueued } from '@/lib/outbox';
import { describeAge, listReportDrafts } from '@/lib/report-drafts';
import { listQueuedReports } from '@/lib/report-outbox';
import {
  classifyReports,
  REPORT_TABS,
  type DraftedRow,
  type PendingRow,
  type ReportsBuckets,
  type ReportTab,
  type SubmittedRow,
} from '@/lib/reports-tabs';
import { listSentReports } from '@/lib/sent-reports';

/**
 * The Reports tab — everything this supervisor has assessed, split by what
 * actually happened when they reached the send screen.
 *
 * It replaces the old Pending screen, which showed only the two kinds of
 * waiting and had nothing to say about the assessments that went through. In
 * the field that was the common case and the one with no screen: a supervisor
 * who wanted to re-read what they had sent had to go back through the route
 * list trainee by trainee.
 *
 * DRAFTED — held back on purpose. Nothing sends these.
 * SUBMITTED — the marks reached the College, and the report with them if it
 *   has been sent from this phone.
 * PENDING — tapped send, could not go. Sends itself; must not be re-marked.
 *
 * Client-rendered from IndexedDB, like `/offline` and the screen it replaces.
 * The reason a supervisor opens this tab is usually that the network has let
 * them down, so a list that needed the network to describe its own backlog
 * would be empty exactly when it matters. The sorting itself lives in
 * `lib/reports-tabs.ts` and is unit-tested there.
 *
 * The one thing here that genuinely needs a connection is the preview: the
 * report is rendered by the server from the marks it already holds, and there
 * is no way to build it on the device. It is offered on every row regardless,
 * with the requirement said out loud rather than the button hidden — a button
 * that disappears in a dead zone reads as work lost.
 */
export default function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>('drafted');
  const [buckets, setBuckets] = useState<ReportsBuckets | null>(null);

  const refresh = useCallback(() => {
    void Promise.all([
      listReportDrafts(),
      listQueued(),
      listQueuedReports(),
      listSentReports(),
      loadOfflineBundle(),
    ]).then(([drafts, queuedMarks, queuedReports, sentReports, bundle]) =>
      setBuckets(
        classifyReports({
          drafts,
          queuedMarks,
          queuedReports,
          sentReports,
          cachedTrainees: bundle?.trainees ?? [],
        }),
      ),
    );
  }, []);

  useEffect(() => {
    refresh();
    // The drainer empties the queues in the background, so re-read when signal
    // returns or the tab regains focus rather than showing work that has
    // already sent.
    window.addEventListener('online', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('online', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  const counts = {
    drafted: buckets?.drafted.length ?? 0,
    submitted: buckets?.submitted.length ?? 0,
    pending: buckets?.pending.length ?? 0,
  };

  return (
    <main className="min-h-dvh bg-[#eceff0]">
      <div className="border-b border-[#e1e9e6] bg-white">
        <div className="p-4 pb-3">
          <h1 className="text-[21px] font-bold tracking-[-0.2px] text-neutral-900">Reports</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-[#5b6b78]">
            Everything you have assessed on this phone, and what happened to it.
          </p>
        </div>

        {/* The top tab bar. `tablist` rather than links: the three lists come
            from one read of IndexedDB, and a route change per tab would mean
            three, each with its own blank moment on a mid-range Android. */}
        <div role="tablist" aria-label="Reports" className="flex px-2">
          {REPORT_TABS.map(({ id, label }) => {
            const on = tab === id;
            return (
              <button
                key={id}
                role="tab"
                type="button"
                id={`reports-tab-${id}`}
                aria-selected={on}
                aria-controls={`reports-panel-${id}`}
                onClick={() => setTab(id)}
                className={`focus:outline-accent flex min-h-[46px] flex-1 items-center justify-center gap-1.5 border-b-[3px] px-2 text-[13.5px] focus:outline focus:outline-[3px] focus:-outline-offset-[3px] ${
                  on
                    ? 'border-[#12665b] font-bold text-[#0d4a43]'
                    : 'border-transparent font-semibold text-[#4d5f6c]'
                }`}
              >
                {label}
                {counts[id] > 0 ? (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                      on ? 'bg-[#e2f0ea] text-[#1c6650]' : 'bg-[#eef1f3] text-[#4d5f6c]'
                    }`}
                  >
                    {counts[id]}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="tabpanel"
        id={`reports-panel-${tab}`}
        aria-labelledby={`reports-tab-${tab}`}
        className="p-4"
      >
        {buckets === null ? (
          // IndexedDB is not readable until after the first paint. An empty
          // state shown for a quarter of a second reads as "your work is gone".
          <p className="py-8 text-center text-[13px] text-[#5b6b78]">Reading this device…</p>
        ) : tab === 'drafted' ? (
          <DraftedList rows={buckets.drafted} />
        ) : tab === 'submitted' ? (
          <SubmittedList rows={buckets.submitted} />
        ) : (
          <PendingList rows={buckets.pending} />
        )}
      </div>
    </main>
  );
}

function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-[#dae3e0] bg-white p-5 text-center">
      <p className="text-[15px] font-bold text-[#1c6650]">{title}</p>
      <p className="mt-2 text-[13px] leading-relaxed text-[#5b6b78]">{detail}</p>
    </div>
  );
}

/** Said once per list rather than per row — the preview is the only thing on
 * this screen that cannot work in a dead zone, and thirty repetitions of it
 * would be noise. */
function NeedsSignalNote() {
  return (
    <p className="mt-3 text-[12px] leading-relaxed text-[#5f6f7c]">
      A preview is built by the College server from the marks it holds, so it needs a connection.
      Everything else on this screen is read from this phone and works without one.
    </p>
  );
}

function DraftedList({ rows }: { rows: DraftedRow[] }) {
  if (rows.length === 0) {
    return (
      <Empty
        title="No drafts"
        detail="A report you save instead of sending waits here until you are ready. You have none."
      />
    );
  }

  return (
    <>
      <p className="rounded-lg bg-[#fff8ec] px-3 py-2 text-[12.5px] font-semibold leading-relaxed text-[#7a5a12]">
        {rows.length === 1 ? 'This report is' : `These ${rows.length} reports are`} waiting for you.
        Nothing sends them automatically — open the trainee and send when you are ready. Each will
        be dated the day you send it.
      </p>
      <ul className="mt-2.5 flex flex-col gap-2.5">
        {rows.map((row) => (
          <li
            key={row.traineeId}
            className="rounded-2xl border border-[#e0c39a] bg-[#fff8ec] p-3.5"
          >
            <p className="text-[15px] font-semibold text-[#14232e]">{row.traineeName}</p>
            <p className="mt-0.5 text-[12.5px] text-[#7a5a12]">
              Saved as a draft {describeAge(row.savedAt)}
            </p>
            {row.note ? (
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#5a4212]">{row.note}</p>
            ) : null}
            <ReportPreviewButton traineeId={row.traineeId} />
            <Link
              href={`/trainee/${row.traineeId}`}
              className="focus:outline-accent mt-2 flex min-h-[44px] items-center justify-center rounded-xl border border-[#12665b] bg-white text-[14px] font-semibold text-[#12665b] focus:outline focus:outline-[3px] focus:outline-offset-2"
            >
              Open and send
            </Link>
          </li>
        ))}
      </ul>
      <NeedsSignalNote />
    </>
  );
}

function SubmittedList({ rows }: { rows: SubmittedRow[] }) {
  if (rows.length === 0) {
    return (
      <Empty
        title="Nothing submitted yet"
        detail="An assessment appears here once your marks have reached the College. Open your route list with a connection to bring this device up to date."
      />
    );
  }

  return (
    <>
      <p className="rounded-lg bg-[#f1f8f4] px-3 py-2 text-[12.5px] font-semibold leading-relaxed text-[#1c6650]">
        {rows.length === 1 ? 'This assessment has' : `These ${rows.length} assessments have`}{' '}
        reached the College. There is nothing left to do for them — do not mark these trainees
        again.
      </p>
      <ul className="mt-2.5 flex flex-col gap-2.5">
        {rows.map((row) => (
          <li key={row.traineeId} className="rounded-2xl border border-[#cfe3d8] bg-white p-3.5">
            <p className="text-[15px] font-semibold text-[#14232e]">{row.traineeName}</p>
            <p className="mt-0.5 text-[12.5px] text-[#1c6650]">
              {row.sentAt !== null
                ? `Report sent ${describeAge(row.sentAt)}`
                : row.marksComplete
                  ? 'Marks submitted. Report not sent from this phone.'
                  : 'Marks submitted.'}
            </p>
            <ReportPreviewButton traineeId={row.traineeId} />
            <Link
              href={`/trainee/${row.traineeId}`}
              className="focus:outline-accent mt-2 flex min-h-[44px] items-center justify-center rounded-xl border border-[#ccd7d4] bg-white text-[14px] font-semibold text-[#3c4c58] focus:outline focus:outline-[3px] focus:outline-offset-2"
            >
              Open the trainee
            </Link>
          </li>
        ))}
      </ul>
      <NeedsSignalNote />
    </>
  );
}

function PendingList({ rows }: { rows: PendingRow[] }) {
  if (rows.length === 0) {
    return (
      <Empty
        title="Nothing pending"
        detail="Everything you have marked has reached the College, and no report is waiting to be sent."
      />
    );
  }

  return (
    <>
      <p className="rounded-lg bg-[#fffaf0] px-3 py-2 text-[12.5px] font-semibold leading-relaxed text-[#6b4400]">
        {rows.length} {rows.length === 1 ? 'item is' : 'items are'} waiting. They send themselves
        when there is signal — you do not need to do anything, and you must not mark these trainees
        again.
      </p>
      <ul className="mt-2.5 flex flex-col gap-2.5">
        {rows.map((row) => (
          <li
            key={`${row.kind}:${row.key}`}
            className="rounded-2xl border border-[#f0dcb4] bg-[#fffaf0] p-3.5"
          >
            <p className="text-[15px] font-semibold text-[#14232e]">{row.traineeName}</p>
            <p className="mt-0.5 text-[13px] text-[#6b4400]">
              {row.kind === 'marks' ? row.instrumentLabel : 'Report waiting to send'}
            </p>
            <p className="mt-1.5 text-[12px] text-[#5f6f7c]">
              {row.kind === 'marks' ? 'Marked' : 'Queued'} {new Date(row.queuedAt).toLocaleString()}
            </p>
            {row.attempts > 0 ? (
              <p className="mt-1.5 text-[12px] leading-relaxed text-[#8a3a2a]">
                {row.attempts} send {row.attempts === 1 ? 'attempt' : 'attempts'} so far — still
                saved here, nothing is lost.
                {row.lastError ? ` Last error: ${row.lastError}` : ''}
              </p>
            ) : null}
            <ReportPreviewButton traineeId={row.traineeId} />
          </li>
        ))}
      </ul>
      <NeedsSignalNote />
    </>
  );
}
