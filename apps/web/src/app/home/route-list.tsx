'use client';

import { useMemo, useState } from 'react';
import {
  emptyFilterMessage,
  initials,
  matchesFilter,
  routeProgress,
  statusMeta,
  statusPlain,
  trackChipStyle,
  traineeCategory,
  traineeFilterLabel,
  TRAINEE_FILTERS,
  type TraineeFilter,
  type TraineeStatus,
} from '@/lib/trainees';
import { useDraftTraineeIds, useSyncStatus } from '@/lib/local/use-device';
import { requestSync } from '@/lib/sync/client';
import { emptyRouteMessage } from '@/lib/local/route-status';

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
  /**
   * False until the device's first read resolves. Without it an empty array
   * is ambiguous, and the two meanings are very different to a supervisor
   * standing in a village: "still reading this phone" is fine, "no trainees
   * assigned to this route" is alarming and, mid-read, false.
   */
  loaded: boolean;
  /** When this device last heard from the server, or null if it never has. */
  syncedAt: number | null;
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
// screen (lines 130–221) — the behavioural spec, per AGENTS.md.
//
// The filter-pill row was deliberately absent until 2026-09-07, on the
// grounds that the prototype only filters on the coordinator's per-route
// drill-down. The College asked for it here: a supervisor with thirty
// trainees on a route walk wants "what have I not started" and "what is
// still sitting unsent on this phone" as one tap, not as a search term.
// The four buckets are computed from the same inputs as the summary tiles
// (see traineeCategory), so a pill's count can never disagree with a tile.
export function RouteList({ routeCode, routeLabel, trainees, loaded, syncedAt }: RouteListProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<TraineeFilter>('all');

  // Live, so a trainee moves to "in progress" the moment the first score is
  // tapped and back out when their marks drain — without this screen being
  // reopened. The trainees themselves arrive the same way, from the same
  // IndexedDB that Realtime writes into.
  const draftTraineeIds = useDraftTraineeIds();
  const syncStatus = useSyncStatus();

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

  // One bucket per trainee, computed once. Drafts are live (useDraftTraineeIds
  // subscribes), so a trainee moves from "not started" into "drafted" the
  // moment the first score is tapped — while the filter is open.
  const categories = useMemo(() => {
    const byId = new Map<string, ReturnType<typeof traineeCategory>>();
    for (const t of trainees) {
      byId.set(
        t.id,
        traineeCategory({
          status: t.status,
          ownSubmittedCount: t.ownSubmittedCount,
          requiredCount: t.requiredCount,
          hasDraft: draftTraineeIds.has(t.id),
        }),
      );
    }
    return byId;
  }, [trainees, draftTraineeIds]);

  const filterCounts = useMemo(() => {
    const counts: Record<TraineeFilter, number> = {
      all: trainees.length,
      assessed: 0,
      'in-progress': 0,
      drafted: 0,
      'not-started': 0,
    };
    for (const category of categories.values()) counts[category] += 1;
    return counts;
  }, [categories, trainees.length]);

  const institutionCount = new Set(trainees.map((t) => t.institution)).size;

  const routeStatus = emptyRouteMessage({
    loaded,
    traineeCount: trainees.length,
    outstanding,
    syncedAt,
    syncStatus,
  });

  const query = search.trim().toLowerCase();
  const matched = useMemo(() => {
    return trainees
      .filter((t) => matchesFilter(filter, categories.get(t.id) ?? 'not-started'))
      .filter(
        (t) =>
          !query ||
          [t.name, t.occupation, t.institution, t.track, statusPlain(t.status)]
            .join(' ')
            .toLowerCase()
            .includes(query),
      );
  }, [trainees, query, filter, categories]);

  const filtering = filter !== 'all';

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
        {/* How fresh this phone's copy is. Everything on this screen is read
            from the device, so the supervisor is entitled to know when it last
            heard from the College — especially after a morning with no signal,
            where "up to date" and "up to date as of Tuesday" look identical. */}
        {syncedAt !== null ? (
          <p className="mt-0.5 text-[12px] text-[#5f6f7c]">
            Updated {new Date(syncedAt).toLocaleString()}
          </p>
        ) : null}

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
          <p className="mt-2 text-[12px] font-semibold text-[#40614f]">{routeStatus.text}</p>
          {/* Offered only when pressing it could change something. A retry on a
              route that is simply empty would suggest the College's own record
              is wrong. */}
          {routeStatus.canRetry ? (
            <button
              type="button"
              onClick={() => void requestSync()}
              className="focus:outline-accent mt-2 min-h-11 w-full rounded-lg border border-[#b9d3c8] bg-white text-[13px] font-bold text-[#1c6650] focus:outline focus:outline-[3px] focus:outline-offset-2"
            >
              Try again
            </button>
          ) : null}
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

        {/* Filter pills. Horizontally scrollable rather than wrapped: on a
            360 px phone a wrapped row pushes the first trainee below the
            fold, and this screen's whole job is the list. */}
        <div
          role="group"
          aria-label="Filter trainees by assessment state"
          className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1"
        >
          {TRAINEE_FILTERS.map((option) => {
            const active = filter === option;
            const count = filterCounts[option];
            return (
              <button
                key={option}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(option)}
                className={`focus:outline-accent min-h-11 shrink-0 rounded-full border px-3.5 text-[13px] font-bold focus:outline focus:outline-[3px] focus:outline-offset-2 ${
                  active
                    ? 'border-[#0d4a43] bg-[#12665b] text-white'
                    : 'border-[#ccd7d4] bg-white text-[#3c4c58]'
                }`}
              >
                {traineeFilterLabel(option)}{' '}
                <span className={active ? 'text-white/80' : 'text-[#5f6f7c]'}>{count}</span>
              </button>
            );
          })}
        </div>

        {query || filtering ? (
          <p role="status" className="mt-2 text-[12.5px] text-[#5b6b78]">
            {matched.length} of {trainees.length} shown
            {filtering ? ` · ${traineeFilterLabel(filter).toLowerCase()}` : ''}
          </p>
        ) : null}

        {(query || filtering) && matched.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-[#ccd7d4] px-5 py-8 text-center">
            <p className="text-[14.5px] font-bold text-[#3c4c58]">
              {query ? 'No trainees match' : traineeFilterLabel(filter)}
            </p>
            <p className="mt-1 text-[13px] text-[#5b6b78]">
              {query
                ? 'Search runs against the offline cache, so it works with no signal.'
                : emptyFilterMessage(filter)}
            </p>
            {filtering ? (
              <button
                type="button"
                onClick={() => setFilter('all')}
                className="focus:outline-accent mt-4 min-h-11 w-full rounded-lg border border-[#ccd7d4] bg-white text-[13.5px] font-bold text-[#3c4c58] focus:outline focus:outline-[3px] focus:outline-offset-2"
              >
                Show all trainees
              </button>
            ) : null}
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
