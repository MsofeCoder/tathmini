'use client';

import { useEffect, useMemo, useState } from 'react';
import { MarkingForm } from '@/components/marking-form';
import type { OfflineBundle, OfflineInstrument, OfflineTrainee, OutboxRecord } from '@/lib/db';
import { draftKey, traineeIdsWithDrafts } from '@/lib/drafts';
import { loadOfflineBundle } from '@/lib/offline-cache';
import { listQueued } from '@/lib/outbox';
import { enqueueReport, traineeIdsWithQueuedReports } from '@/lib/report-outbox';
import { readyToSendReport } from '@/lib/report-readiness';
import { generateReport } from '@/app/trainee/[id]/actions';
import {
  initials,
  routeProgress,
  statusMeta,
  trackChipStyle,
  traineeParticulars,
} from '@/lib/trainees';

/**
 * The no-signal entry point. Deliberately a client-rendered, statically
 * prerendered page with no server data of its own: every other screen is
 * server-rendered against Supabase and simply cannot be produced when the
 * device cannot reach the server (the auth gate in middleware.ts is itself
 * a network call). The service worker serves this page when a navigation
 * fails, and everything it shows comes from IndexedDB — the route snapshot
 * written by the route list on its last online load.
 *
 * Marking here is the real thing, not a degraded copy: it renders the same
 * MarkingForm component the online route does, from the same cached
 * criteria, and submits through the same outbox.
 */
export default function OfflinePage() {
  const [bundle, setBundle] = useState<OfflineBundle | null | undefined>(undefined);
  const [queued, setQueued] = useState<OutboxRecord[]>([]);
  const [draftTraineeIds, setDraftTraineeIds] = useState<Set<string>>(new Set());
  const [traineeId, setTraineeId] = useState<string | null>(null);
  const [instrumentId, setInstrumentId] = useState<string | null>(null);
  const [queuedReportIds, setQueuedReportIds] = useState<Set<string>>(new Set());
  const [showQueue, setShowQueue] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    void loadOfflineBundle().then((found) => setBundle(found ?? null));
    void listQueued().then(setQueued);
    void traineeIdsWithDrafts().then(setDraftTraineeIds);
    void traineeIdsWithQueuedReports().then(setQueuedReportIds);
  }, []);

  const queuedKeys = useMemo(() => new Set(queued.map((r) => r.key)), [queued]);
  const queuedCount = queued.length;

  // The SAME pure function the online route list uses, fed the same counts —
  // so the offline tiles cannot drift from the online ones. That parity is the
  // point: a supervisor who loses signal mid-route must not see their progress
  // change underneath them.
  const progress = useMemo(
    () =>
      routeProgress(
        (bundle?.trainees ?? []).map((t) => ({
          status: t.status,
          ownSubmittedCount: t.ownSubmittedCount,
          requiredCount: t.requiredCount,
          hasDraft: draftTraineeIds.has(t.id),
        })),
      ),
    [bundle, draftTraineeIds],
  );

  const trainee = bundle?.trainees.find((t) => t.id === traineeId) ?? null;
  const instrument = bundle?.instruments.find((i) => i.id === instrumentId) ?? null;

  const query = search.trim().toLowerCase();
  const matched = useMemo(() => {
    const all = bundle?.trainees ?? [];
    if (!query) return all;
    return all.filter((t) =>
      [t.name, t.occupation, t.institution, t.track].join(' ').toLowerCase().includes(query),
    );
  }, [bundle, query]);

  if (bundle === undefined) {
    return <Shell>{null}</Shell>;
  }

  if (bundle === null) {
    return (
      <Shell>
        <h1 className="text-[22px] font-bold text-neutral-900">Nothing saved on this device yet</h1>
        <p className="mt-3 text-[13.5px] leading-relaxed text-[#3c4c58]">
          Open your route list once while you have a connection. That saves your whole route — every
          trainee and every assessment form — onto this phone, so you can mark with no signal
          afterwards.
        </p>
      </Shell>
    );
  }

  if (showQueue) {
    return <QueueView records={queued} onBack={() => setShowQueue(false)} />;
  }

  if (trainee && instrument && trainee.slot) {
    return (
      <MarkingForm
        traineeId={trainee.id}
        traineeName={trainee.name}
        instrumentId={instrument.id}
        instrumentCode={instrument.code}
        instrumentLabel={instrument.label}
        slot={trainee.slot}
        criteria={instrument.criteria}
        returnHref="/offline"
      />
    );
  }

  if (trainee) {
    return (
      <TraineeProfile
        trainee={trainee}
        instruments={bundle.instruments.filter((i) => i.track === trainee.track)}
        queuedKeys={queuedKeys}
        reportQueued={queuedReportIds.has(trainee.id)}
        supervisorName={bundle.supervisorName}
        onPick={setInstrumentId}
        onBack={() => setTraineeId(null)}
      />
    );
  }

  return (
    <main className="min-h-dvh bg-[#eceff0]">
      <div className="border-b border-[#e1e9e6] bg-white p-4">
        <p className="text-[12px] font-extrabold tracking-[0.8px] text-[#6b4400]">
          WORKING OFFLINE
        </p>
        <h1 className="mt-1 text-[21px] font-bold tracking-[-0.2px] text-neutral-900">
          {bundle.routeCode}
        </h1>
        <p className="mt-1 text-[13px] text-[#5b6b78]">
          {bundle.trainees.length} {bundle.trainees.length === 1 ? 'trainee' : 'trainees'} stored on
          this device · saved {new Date(bundle.cachedAt).toLocaleString()}
        </p>
        {queuedCount > 0 ? (
          <button
            type="button"
            onClick={() => setShowQueue(true)}
            className="focus:outline-accent mt-2 flex min-h-11 w-full items-center justify-between gap-3 rounded-lg bg-[#fffaf0] px-3 py-2 text-left focus:outline focus:outline-[3px] focus:outline-offset-2"
          >
            <span className="text-[12.5px] font-semibold text-[#6b4400]">
              {queuedCount} completed {queuedCount === 1 ? 'assessment is' : 'assessments are'}{' '}
              waiting to send. They go automatically when there is signal.
            </span>
            <span className="shrink-0 text-[13px] font-bold text-[#6b4400]">View ›</span>
          </button>
        ) : null}

        {/* The same three tiles as the online route list, from the same
            routeProgress() call, so the numbers agree in both modes. */}
        <div className="mt-3 flex gap-2">
          <Tile value={progress.assessed} label="Assessed" />
          <Tile value={progress.inProgress} label="In progress" />
          <Tile value={progress.notStarted} label="Not started" />
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e1e9e6]">
          <div
            className="bg-teal-mid h-full rounded-full"
            style={{ width: `${progress.pct}%` }}
            role="progressbar"
            aria-valuenow={progress.pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Route completion"
          />
        </div>
        <p className="mt-1 text-[12px] text-[#5f6f7c]">{progress.pct}% of your route assessed</p>
        <div className="focus-within:border-teal-mid mt-3 flex items-center gap-2 rounded-xl border border-[#ccd7d4] bg-white px-3 py-2.5">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search this route — name, trade, center"
            aria-label="Search trainees on my route"
            className="w-full text-[15px] text-neutral-900 outline-none"
          />
        </div>
      </div>

      <ul className="flex flex-col gap-2.5 p-4">
        {matched.map((t) => {
          const track = trackChipStyle(t.track);
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setTraineeId(t.id)}
                disabled={!t.slot}
                className="focus:outline-accent flex w-full items-center gap-3 rounded-2xl border border-[#e1e9e6] bg-white p-3.5 text-left focus:outline focus:outline-[3px] focus:outline-offset-2 disabled:opacity-50"
              >
                <div className="text-teal-deep flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-[#ddebe8] font-bold">
                  {initials(t.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-[#14232e]">{t.name}</p>
                  <p className="truncate text-[13px] text-[#5b6b78]">{t.occupation}</p>
                  <p className="truncate text-[12.5px] text-[#5f6f7c]">{t.institution}</p>
                </div>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span
                    className="rounded-full px-2 py-1 text-[10.5px] font-extrabold tracking-[0.5px]"
                    style={{ background: track.bg, color: track.fg }}
                  >
                    {t.track}
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{
                      background: statusMeta(t.status).bg,
                      color: statusMeta(t.status).fg,
                    }}
                  >
                    {statusMeta(t.status).short}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </main>
  );
}

/**
 * The offline trainee profile. Shows the same pre-loaded particulars as the
 * online /trainee/[id] screen, built by the same traineeParticulars() helper
 * from the register columns cached in the route snapshot — "nothing is typed
 * in the field" has to hold with no signal too, which is when it matters most.
 */
function TraineeProfile({
  trainee,
  instruments,
  queuedKeys,
  reportQueued,
  supervisorName,
  onPick,
  onBack,
}: {
  trainee: OfflineTrainee;
  instruments: OfflineInstrument[];
  queuedKeys: Set<string>;
  reportQueued: boolean;
  supervisorName: string;
  onPick: (id: string) => void;
  onBack: () => void;
}) {
  const [reportState, setReportState] = useState<'idle' | 'working' | 'queued' | 'sent'>(
    reportQueued ? 'queued' : 'idle',
  );
  const [reportError, setReportError] = useState<string | null>(null);

  const canSend = readyToSendReport({
    instrumentIds: instruments.map((i) => i.id),
    submittedInstrumentIds: trainee.submittedInstrumentIds,
    queuedInstrumentIds: instruments
      .filter((i) => queuedKeys.has(draftKey(trainee.id, i.id)))
      .map((i) => i.id),
  });

  async function handleSend() {
    setReportError(null);
    setReportState('working');
    // Queue FIRST, so the instruction survives the tab closing, the battery
    // dying, or the connection never arriving. Only then try to act on it.
    await enqueueReport({ traineeId: trainee.id, traineeName: trainee.name });
    setReportState('queued');

    if (!navigator.onLine) return;
    try {
      const result = await generateReport(trainee.id);
      if ('error' in result) {
        // Left queued deliberately: the usual cause is that the marks
        // themselves have not drained yet, which the next pass fixes.
        setReportError(result.error);
        return;
      }
      setReportState('sent');
    } catch {
      // No usable connection despite navigator.onLine. It stays queued.
    }
  }
  const rows = traineeParticulars({
    track: trainee.track,
    registrationNumber: trainee.registrationNumber,
    occupation: trainee.occupation,
    course: trainee.course,
    modeOfStudy: trainee.modeOfStudy,
    institution: trainee.institution,
    region: trainee.region,
    district: trainee.district,
    email: trainee.email,
    phone: trainee.phone,
    assessedByLabel: supervisorName,
  });

  return (
    <main className="min-h-dvh bg-[#eceff0]">
      <div className="border-b border-[#e1e9e6] bg-white p-4">
        <button
          type="button"
          onClick={onBack}
          className="text-teal-mid min-h-11 text-[14px] font-semibold"
        >
          ‹ My route
        </button>
        <p className="mt-1 text-[13px] font-semibold text-[#5b6b78]">You are about to assess</p>
        <h1 className="mt-1 text-[21px] font-bold tracking-[-0.2px] text-neutral-900">
          {trainee.name}
        </h1>
        <p className="mt-1 text-[13px] text-[#5f6f7c]">
          {trainee.occupation} · {trainee.institution}
        </p>
      </div>

      <div className="p-4 pb-0">
        <div className="overflow-hidden rounded-2xl border border-[#e1e9e6] bg-white">
          <div className="border-b border-[#f1f5f4] px-4 py-3">
            <p className="text-[12px] font-extrabold tracking-[0.6px] text-[#5b6b78]">
              PRE-LOADED PARTICULARS
            </p>
          </div>
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex justify-between gap-4 border-b border-[#f1f5f4] px-4 py-3.5 last:border-b-0"
            >
              <span className="shrink-0 text-[13px] font-semibold text-[#5b6b78]">{row.label}</span>
              <span className="text-right text-[14px] font-semibold text-[#14232e]">
                {row.value}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[12.5px] leading-relaxed text-[#5f6f7c]">
          Saved on this phone from your last online visit. Nothing here needs typing in the field.
        </p>
      </div>

      <div className="flex flex-col gap-2.5 p-4">
        {instruments.map((instrument) => {
          if (trainee.submittedInstrumentIds.includes(instrument.id)) {
            return (
              <div
                key={instrument.id}
                className="flex min-h-[52px] items-center justify-between rounded-xl border border-[#dae3e0] bg-[#f1f3f4] px-4"
              >
                <span className="text-[15px] font-semibold text-[#3c4c58]">{instrument.label}</span>
                <span className="text-[13px] font-bold text-[#1c6650]">Submitted ✓</span>
              </div>
            );
          }
          if (queuedKeys.has(draftKey(trainee.id, instrument.id))) {
            return (
              <div
                key={instrument.id}
                className="rounded-xl border border-[#f0dcb4] bg-[#fffaf0] px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[15px] font-semibold text-[#3c4c58]">
                    {instrument.label}
                  </span>
                  <span className="text-[13px] font-bold text-[#6b4400]">Waiting to send</span>
                </div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-[#6b4400]">
                  Already marked and saved on this phone. Do not mark it again.
                </p>
              </div>
            );
          }
          return (
            <button
              key={instrument.id}
              type="button"
              onClick={() => onPick(instrument.id)}
              className="focus:outline-accent flex min-h-[52px] items-center justify-center rounded-xl bg-[#12665b] text-[15px] font-bold text-white focus:outline focus:outline-[3px] focus:outline-offset-2"
            >
              Start {instrument.label}
            </button>
          );
        })}
        {/* The report can only be built on the server — it renders the VETA
            form through headless Chromium and then e-mails it. Offline the
            button still accepts the instruction and keeps it, exactly as the
            marks are kept. Without this an IPT supervisor has no way to send
            at all: an IPT trainee has one instrument, so once it is marked
            this screen would otherwise have nothing left to offer. */}
        {canSend ? (
          <div className="mt-1 rounded-xl border border-[#e1e9e6] bg-white p-3.5">
            <p className="text-[13px] font-semibold text-[#3c4c58]">Report</p>
            {reportState === 'sent' ? (
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#1c6650]">
                Report sent.
              </p>
            ) : reportState === 'queued' ? (
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#6b4400]">
                Report waiting to send. It goes on its own as soon as there is a connection — you do
                not need to come back to this screen.
              </p>
            ) : (
              <>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#5f6f7c]">
                  Your assessment is complete. Sending stores the report and e-mails it.
                </p>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={reportState === 'working'}
                  className="focus:outline-accent mt-2.5 flex min-h-[48px] w-full items-center justify-center rounded-xl bg-[#12665b] text-[15px] font-bold text-white focus:outline focus:outline-[3px] focus:outline-offset-2 disabled:opacity-70"
                >
                  {reportState === 'working' ? 'Sending…' : 'Send report'}
                </button>
              </>
            )}
            {reportError ? (
              <p role="alert" className="mt-2 text-[12.5px] leading-relaxed text-[#7a3325]">
                {reportError}
              </p>
            ) : null}
          </div>
        ) : null}

        <p className="mt-1 text-[12.5px] leading-relaxed text-[#5f6f7c]">
          Marks you complete here are stored on this phone and send themselves as soon as there is a
          connection.
        </p>
      </div>
    </main>
  );
}

/** One of the three route-progress tiles, mirroring the online route list. */
function Tile({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex-1 rounded-xl border border-[#e1e9e6] bg-white px-2 py-2 text-center">
      <p className="text-[18px] font-bold text-[#14232e]">{value}</p>
      <p className="text-[11px] font-semibold text-[#5f6f7c]">{label}</p>
    </div>
  );
}

/**
 * The pending-sync queue — ROADMAP.md Phase 1's last unbuilt line. A count
 * alone is not enough in the field: a supervisor who marked six trainees in a
 * dead zone needs to see WHICH six are safe, by name, or they will reasonably
 * assume work was lost and mark somebody twice. Everything shown is read from
 * the outbox record itself, so it needs no network to describe.
 */
function QueueView({ records, onBack }: { records: OutboxRecord[]; onBack: () => void }) {
  return (
    <main className="min-h-dvh bg-[#eceff0]">
      <div className="border-b border-[#e1e9e6] bg-white p-4">
        <button
          type="button"
          onClick={onBack}
          className="text-teal-mid min-h-11 text-[14px] font-semibold"
        >
          ‹ My route
        </button>
        <h1 className="mt-1 text-[21px] font-bold tracking-[-0.2px] text-neutral-900">
          Waiting to send
        </h1>
        <p className="mt-1 text-[13px] leading-relaxed text-[#5b6b78]">
          {records.length} completed {records.length === 1 ? 'assessment' : 'assessments'} saved on
          this phone. They send themselves when there is signal — you do not need to do anything,
          and you must not mark these trainees again.
        </p>
      </div>

      <ul className="flex flex-col gap-2.5 p-4">
        {records.map((record) => (
          <li key={record.key} className="rounded-2xl border border-[#f0dcb4] bg-[#fffaf0] p-3.5">
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
    </main>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#eceff0] p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm">
        <p className="text-[12px] font-extrabold tracking-[0.7px] text-[#6b4400]">
          WORKING OFFLINE
        </p>
        {children}
      </div>
    </main>
  );
}
