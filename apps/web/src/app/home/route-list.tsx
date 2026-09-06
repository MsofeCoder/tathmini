'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  initials,
  routeProgress,
  statusMeta,
  statusPlain,
  trackChipStyle,
  type TraineeStatus,
} from '@/lib/trainees';
import { saveOfflineBundle, type OfflineBundleInput } from '@/lib/offline-cache';
import { traineeIdsWithDrafts } from '@/lib/drafts';

export interface RouteListTrainee {
  id: string;
  name: string;
  occupation: string;
  institution: string;
  track: 'TP' | 'IPT';
  status: TraineeStatus;
  /** This supervisor's own submitted marks for this trainee — see routeProgress(). */
  ownSubmittedCount: number;
  /** Instruments this trainee's track requires (TP: 2, IPT: 1). */
  requiredCount: number;
}

export interface RouteListProps {
  routeCode: string;
  routeLabel: string | null;
  trainees: RouteListTrainee[];
  /** Snapshot written to IndexedDB so the whole route can be marked with no signal. */
  offlineBundle: OfflineBundleInput;
}

/** Highlights the first case-insensitive match of `query` inside `text`. */
function HighlightedName({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const index = text.toLowerCase().indexOf(query);
  if (index === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-[2px] bg-[#ffe9c2] text-[#4a3a1a]">
        {text.slice(index, index + query.length)}
      </mark>
      {text.slice(index + query.length)}
    </>
  );
}

// Layout/copy/colours ported from reference/Tathmini.dc.html's showList
// screen (lines 130–221) — the behavioural spec, per AGENTS.md. One
// deliberate departure, because the real system differs from the
// prototype's fake one — see MEMORY.md: no filter-pill row (that only
// exists on the coordinator's Phase 3 per-route drill-down, not this
// supervisor screen).
export function RouteList({ routeCode, routeLabel, trainees, offlineBundle }: RouteListProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');

  // Loading this screen with a connection is what arms the device for
  // offline marking, in both halves: the route snapshot goes to IndexedDB,
  // and prefetching /offline pulls that page's JavaScript into the service
  // worker's cache. Without the prefetch a supervisor who never opened
  // /offline while online would have the data but not the code to render
  // it.
  useEffect(() => {
    void saveOfflineBundle(offlineBundle);
    router.prefetch('/offline');
  }, [offlineBundle, router]);

  // Drafts live in IndexedDB, which does not exist during the server
  // render, so the counters start from server state alone and refine once
  // the device's drafts have been read. Starting empty rather than
  // blocking on it keeps the list interactive offline-first; the only
  // visible effect is a trainee moving from "not started" to "in
  // progress" a moment after paint.
  const [draftTraineeIds, setDraftTraineeIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let cancelled = false;
    void traineeIdsWithDrafts().then((ids) => {
      if (!cancelled) setDraftTraineeIds(ids);
    });
    return () => {
      cancelled = true;
    };
  }, [trainees]);

  const { assessed, inProgress, notStarted, pct } = useMemo(
    () =>
      routeProgress(
        trainees.map((t) => ({
          status: t.status,
          ownSubmittedCount: t.ownSubmittedCount,
          requiredCount: t.requiredCount,
          hasDraft: draftTraineeIds.has(t.id),
        })),
      ),
    [trainees, draftTraineeIds],
  );
  const outstanding = trainees.length - assessed;

  const institutionCount = new Set(trainees.map((t) => t.institution)).size;

  const query = search.trim().toLowerCase();
  const matched = useMemo(() => {
    if (!query) return trainees;
    return trainees.filter((t) =>
      [t.name, t.occupation, t.institution, t.track, statusPlain(t.status)]
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }, [trainees, query]);

  return (
    <main className="min-h-dvh bg-[#eceff0]">
      <div className="border-b border-[#e1e9e6] bg-white p-4">
        <p className="text-teal-mid text-[12px] font-extrabold tracking-[0.8px]">MY ROUTE</p>
        <h1 className="mt-1 text-[21px] font-bold tracking-[-0.2px] text-neutral-900">
          {routeCode}
        </h1>
        {routeLabel ? <p className="text-[13px] text-[#5f6f7c]">{routeLabel}</p> : null}
        <p className="mt-1 text-[13px] text-[#5b6b78]">
          {trainees.length} {trainees.length === 1 ? 'trainee' : 'trainees'} · {institutionCount}{' '}
          {institutionCount === 1 ? 'center' : 'centers'}
        </p>

        <div className="mt-3 rounded-xl border border-[#d5e6df] bg-[#f1f6f4] px-3.5 py-3">
          <div className="flex items-baseline justify-between">
            <p className="text-[13px] font-bold text-[#1c6650]">
              {assessed} of {trainees.length} trainees assessed
            </p>
            <p className="text-[20px] font-extrabold text-[#1c6650]">{pct}%</p>
          </div>
          <div className="mt-2 h-[10px] rounded-md bg-[#dce9e3]">
            <div
              className="h-full rounded-md"
              style={{ width: `${pct}%`, background: pct === 100 ? '#1c7a5e' : '#12665b' }}
            />
          </div>
          <p className="mt-2 text-[12px] font-semibold text-[#40614f]">
            {trainees.length === 0
              ? 'No trainees assigned to this route yet.'
              : outstanding === 0
                ? 'Route complete — you have assessed every trainee.'
                : `${outstanding} still to assess`}
          </p>
        </div>

        <div className="mt-3 flex gap-2">
          <div className="flex-1 rounded-[10px] border border-[#d5e6df] bg-[#f1f6f4] px-2.5 py-2">
            <p className="text-[20px] font-bold text-[#1c6650]">{assessed}</p>
            <p className="text-[10.5px] font-bold tracking-[0.4px] text-[#40614f]">ASSESSED</p>
          </div>
          <div className="flex-1 rounded-[10px] border border-[#f0dcb4] bg-[#fffaf0] px-2.5 py-2">
            <p className="text-[20px] font-bold text-[#6b4400]">{inProgress}</p>
            <p className="text-[10.5px] font-bold tracking-[0.4px] text-[#6b4400]">IN PROGRESS</p>
          </div>
          <div className="flex-1 rounded-[10px] border border-[#dae3e0] bg-[#f1f3f4] px-2.5 py-2">
            <p className="text-[20px] font-bold text-[#4d5f6c]">{notStarted}</p>
            <p className="text-[10.5px] font-bold tracking-[0.4px] text-[#4d5f6c]">NOT STARTED</p>
          </div>
        </div>
      </div>

      <div className="p-4 pb-6">
        <div className="focus-within:border-teal-mid flex items-center gap-2 rounded-xl border border-[#ccd7d4] bg-white px-3 py-2.5">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search this route — name, trade, center"
            aria-label="Search trainees on my route"
            className="w-full text-[15px] text-neutral-900 outline-none"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="text-[#5b6b78]"
            >
              ×
            </button>
          ) : null}
        </div>

        {query ? (
          <p role="status" className="mt-2 text-[12.5px] text-[#5b6b78]">
            {matched.length} of {trainees.length} shown
          </p>
        ) : null}

        {query && matched.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-[#ccd7d4] px-5 py-8 text-center">
            <p className="text-[14.5px] font-bold text-[#3c4c58]">No trainees match</p>
            <p className="mt-1 text-[13px] text-[#5b6b78]">
              Search runs against the offline cache, so it works with no signal.
            </p>
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-2.5">
            {matched.map((t) => {
              const meta = statusMeta(t.status);
              const track = trackChipStyle(t.track);
              return (
                <li key={t.id}>
                  <a
                    href={`/trainee/${t.id}`}
                    className={`flex items-center gap-3 rounded-2xl border bg-white p-3.5 ${
                      t.status === 'locked' ? 'border-[#e6ecea]' : 'border-[#e1e9e6]'
                    }`}
                  >
                    <div
                      className={`flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full font-bold ${
                        t.status === 'locked'
                          ? 'bg-[#e6ecea] text-[#4d5f6c]'
                          : 'text-teal-deep bg-[#ddebe8]'
                      }`}
                    >
                      {initials(t.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-[#14232e]">
                        <HighlightedName text={t.name} query={query} />
                      </p>
                      <p className="truncate text-[13px] text-[#5b6b78]">{t.occupation}</p>
                      <p className="truncate text-[12.5px] text-[#5f6f7c]">{t.institution}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span
                        className="rounded-full px-2 py-1 text-[10.5px] font-extrabold tracking-[0.5px]"
                        style={{ background: track.bg, color: track.fg }}
                      >
                        {t.track}
                      </span>
                      <span
                        className="rounded-full px-2 py-1 text-[10.5px] font-extrabold tracking-[0.5px]"
                        style={{ background: meta.bg, color: meta.fg }}
                      >
                        {meta.short}
                      </span>
                    </div>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
