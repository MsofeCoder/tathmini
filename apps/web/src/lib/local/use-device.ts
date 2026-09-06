'use client';

import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import { db, type SessionMeta } from '../db';
import { traineeIdsWithDrafts } from '../drafts';
import { getSyncStatus, subscribeSyncStatus, type SyncStatus } from '../sync/client';
import { buildReportsView, waitingCount, type ReportsView } from './reports';
import type { DeviceRows } from './derive';

/**
 * Reading the device, live.
 *
 * Dexie's own `liveQuery` re-runs the read whenever a table it touched
 * changes, which is what makes "the screens listen to Realtime" true rather
 * than aspirational: a change arrives on the socket, `realtime.ts` writes the
 * row, and every mounted screen re-renders from it. Nothing polls, nothing
 * needs a refresh button, and the same mechanism updates the screen when the
 * supervisor's OWN outbox drains.
 *
 * `dexie-react-hooks` would give the same thing in one line, but it is a new
 * package in the client bundle and AGENTS.md says to ask first. Dexie core
 * already exports the observable, so this is eight lines and no dependency.
 */

/** Everything the screens read. Small by design — a route is tens of trainees
 * and the criteria are 89 rows shared by everyone. */
export async function readDeviceRows(): Promise<DeviceRows> {
  const [trainees, assignments, instruments, criteria, marks, results, reports, session] =
    await Promise.all([
      db.trainees.toArray(),
      db.assignments.toArray(),
      db.instruments.toArray(),
      db.criteria.toArray(),
      db.marks.toArray(),
      db.results.toArray(),
      db.reports.toArray(),
      db.meta.get('session') as Promise<SessionMeta | undefined>,
    ]);

  return {
    trainees,
    assignments,
    instruments,
    criteria,
    marks,
    results,
    reports,
    session: session ?? null,
  };
}

/**
 * `undefined` while the first read is in flight — which the screens render as
 * a blank shell, NOT as an empty route. The difference matters: "you have no
 * trainees" is a claim, and making it for the half-second before IndexedDB
 * answers would tell a supervisor in a village that their route had been
 * taken away.
 */
export function useDeviceRows(): DeviceRows | undefined {
  const [rows, setRows] = useState<DeviceRows | undefined>(undefined);

  useEffect(() => {
    const subscription = liveQuery(() => readDeviceRows()).subscribe({
      next: setRows,
      // A failed read leaves the last good rows on screen rather than
      // blanking the page under a supervisor who is using it.
      error: () => {},
    });
    return () => subscription.unsubscribe();
  }, []);

  return rows;
}

/**
 * Trainee ids with an unsubmitted draft on this device. Kept out of
 * `useDeviceRows` on purpose: a draft is written on every single score tap,
 * and folding it into the main read would re-run all seven tables against the
 * 50 ms tap budget in AGENTS.md.
 */
export function useDraftTraineeIds(): Set<string> {
  const [ids, setIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const subscription = liveQuery(() => traineeIdsWithDrafts()).subscribe({
      next: setIds,
      error: () => {},
    });
    return () => subscription.unsubscribe();
  }, []);

  return ids;
}

/**
 * The Reports screen's three lists, live.
 *
 * One subscription over every source the screen needs: the device replica, the
 * held drafts, both queues and the send receipts. `liveQuery` re-runs it
 * whenever any of those tables changes, so a report that drains in the
 * background moves from Pending to Submitted under the supervisor's thumb with
 * no refresh, no focus listener and no polling.
 *
 * `drafts` — the per-score-tap table — is deliberately NOT a source here. It is
 * written on every tap, and reading eight tables against the 50 ms tap budget
 * in AGENTS.md is exactly what `useDraftTraineeIds` exists to avoid.
 */
export function useReportsView(): ReportsView | undefined {
  const [view, setView] = useState<ReportsView | undefined>(undefined);

  useEffect(() => {
    const subscription = liveQuery(async () => {
      const [rows, drafts, queuedMarks, queuedReports, sentReports] = await Promise.all([
        readDeviceRows(),
        db.reportDrafts.toArray(),
        db.outbox.toArray(),
        db.reportOutbox.toArray(),
        db.sentReports.toArray(),
      ]);
      return buildReportsView({ rows, drafts, queuedMarks, queuedReports, sentReports });
    }).subscribe({
      next: setView,
      // A failed read leaves the last good lists on screen rather than
      // blanking the page under a supervisor who is using it.
      error: () => {},
    });
    return () => subscription.unsubscribe();
  }, []);

  return view;
}

/**
 * How much finished work is waiting to leave this phone — the number on the
 * Reports tab.
 *
 * Derived from the same view the screen renders, deliberately, rather than by
 * adding up the queues here. A trainee can have a held draft AND a queued
 * mark; counting the tables separately would say 2 where the screen shows 1,
 * and a badge that disagrees with the list under it is worse than no badge.
 *
 * Submitted work never counts: a number that climbed all week would stop
 * meaning anything.
 */
export function usePendingCount(): number {
  const view = useReportsView();
  return view ? waitingCount(view) : 0;
}

/**
 * What the app is doing about the device's copy, live.
 *
 * Read by the route list so an empty screen can say WHY it is empty. The
 * difference between "downloading your route" and "you have no students" is
 * the difference between waiting and giving up, and until now a supervisor
 * upgrading from the previous build saw the second while the first was true.
 */
export function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>(() => getSyncStatus());

  useEffect(() => {
    setStatus(getSyncStatus());
    return subscribeSyncStatus(setStatus);
  }, []);

  return status;
}
