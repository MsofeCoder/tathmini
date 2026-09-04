'use client';

import { useEffect, useMemo, useState } from 'react';
import { MarkingForm } from '@/components/marking-form';
import type { OfflineBundle, OfflineInstrument, OfflineTrainee } from '@/lib/db';
import { draftKey } from '@/lib/drafts';
import { loadOfflineBundle } from '@/lib/offline-cache';
import { listQueued } from '@/lib/outbox';
import { initials, trackChipStyle } from '@/lib/trainees';

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
  const [queuedKeys, setQueuedKeys] = useState<Set<string>>(new Set());
  const [traineeId, setTraineeId] = useState<string | null>(null);
  const [instrumentId, setInstrumentId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    void loadOfflineBundle().then((found) => setBundle(found ?? null));
    void listQueued().then((queued) => setQueuedKeys(new Set(queued.map((r) => r.key))));
  }, []);

  const queuedCount = queuedKeys.size;

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
      <InstrumentPicker
        trainee={trainee}
        instruments={bundle.instruments.filter((i) => i.track === trainee.track)}
        queuedKeys={queuedKeys}
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
          <p className="mt-2 rounded-lg bg-[#fffaf0] px-3 py-2 text-[12.5px] font-semibold text-[#6b4400]">
            {queuedCount} completed {queuedCount === 1 ? 'assessment is' : 'assessments are'}{' '}
            waiting to send. They will go automatically when there is signal.
          </p>
        ) : null}
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
                <span
                  className="shrink-0 rounded-full px-2 py-1 text-[10.5px] font-extrabold tracking-[0.5px]"
                  style={{ background: track.bg, color: track.fg }}
                >
                  {t.track}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </main>
  );
}

function InstrumentPicker({
  trainee,
  instruments,
  queuedKeys,
  onPick,
  onBack,
}: {
  trainee: OfflineTrainee;
  instruments: OfflineInstrument[];
  queuedKeys: Set<string>;
  onPick: (id: string) => void;
  onBack: () => void;
}) {
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
        <p className="mt-1 text-[12.5px] leading-relaxed text-[#5f6f7c]">
          Marks you complete here are stored on this phone and send themselves as soon as there is a
          connection.
        </p>
      </div>
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
