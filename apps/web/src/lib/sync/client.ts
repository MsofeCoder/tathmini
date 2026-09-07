import { applySync } from './apply';
import type { SyncPayload } from './types';

/**
 * Running a sync from the browser: fetch the payload, write it to the device.
 *
 * The outcomes are kept distinct because the app does something different
 * with each, and collapsing them is how offline apps end up signing people
 * out in villages:
 *
 * - `synced`          — the device is current.
 * - `unauthenticated` — the session is genuinely gone. Sign in again.
 * - `unreachable`     — the network failed. Change NOTHING and carry on with
 *                       the data already on the device. This is the normal
 *                       case in the field, not an error state.
 */
export type SyncOutcome = 'synced' | 'unauthenticated' | 'unreachable';

/**
 * What the app is doing about the device's copy right now, so a screen can
 * say so.
 *
 * This exists because of what a supervisor upgrading from the previous build
 * actually saw. Their phone had a session but an empty IndexedDB, so `/home`
 * read it in a couple of milliseconds, found nothing, and said "Your route has
 * not reached this phone yet" — while the sync that would fill it was still
 * in flight. The screen was telling them they had no students at the exact
 * moment it was downloading them, and if the sync then failed it said the same
 * thing forever, with nothing to press.
 *
 * `never` rather than `idle` for the opening state: it distinguishes a device
 * that has genuinely never heard from the College from one between syncs, and
 * those two deserve different words on screen.
 */
export type SyncStatus = 'never' | 'syncing' | 'synced' | 'unreachable' | 'signed-out';

let status: SyncStatus = 'never';
const listeners = new Set<(value: SyncStatus) => void>();

export function getSyncStatus(): SyncStatus {
  return status;
}

/** Subscribe to status changes. Returns the unsubscribe function. */
export function subscribeSyncStatus(listener: (value: SyncStatus) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setStatus(next: SyncStatus): void {
  if (next === status) return;
  status = next;
  for (const listener of listeners) listener(next);
}

/** Test seam — the status is module state, and a test that changes it must be
 * able to put it back. */
export function resetSyncStatus(): void {
  status = 'never';
  listeners.clear();
}

function statusFor(outcome: SyncOutcome, previous: SyncStatus): SyncStatus {
  if (outcome === 'synced') return 'synced';
  if (outcome === 'unauthenticated') return 'signed-out';
  // A failed sync must never downgrade a device that HAS data. It is still
  // holding a good copy; it simply could not check for a newer one, which is
  // the ordinary state of a working day on a College route.
  return previous === 'synced' ? 'synced' : 'unreachable';
}

export async function runFullSync(): Promise<SyncOutcome> {
  // Captured before the run, so a failure can be judged against what the
  // device already had rather than against 'syncing'.
  const before = status;
  setStatus('syncing');
  const outcome = await attemptSync();
  setStatus(statusFor(outcome, before));
  return outcome;
}

async function attemptSync(): Promise<SyncOutcome> {
  let response: Response;
  try {
    response = await fetch('/api/sync', {
      method: 'GET',
      cache: 'no-store',
      // Without this a redirect to /login would arrive as an opaque 200 and
      // be parsed as a payload, wiping the device's tables with nothing.
      redirect: 'error',
      headers: { accept: 'application/json' },
    });
  } catch {
    return 'unreachable';
  }

  if (response.status === 401) return 'unauthenticated';
  if (!response.ok) return 'unreachable';

  let payload: SyncPayload;
  try {
    payload = (await response.json()) as SyncPayload;
  } catch {
    return 'unreachable';
  }

  // A payload without a user is not a payload. Applying it would stamp an
  // empty session over a good one and make the next sync look like a user
  // switch, which wipes the device.
  if (!payload?.session?.userId) return 'unreachable';

  await applySync(payload);
  return 'synced';
}

/**
 * Coalesces sync requests.
 *
 * Realtime asks for a re-sync whenever it sees a change it cannot apply
 * precisely, and a roster import or a route reassignment produces a burst of
 * those — dozens of rows in a second. One sync answers all of them. Without
 * this, a supervisor standing next to a Super Admin doing an import would
 * spend that minute re-downloading their route on 3G.
 *
 * A request that arrives while a sync is running schedules exactly one more
 * afterwards, so a change that landed mid-flight is never missed.
 */
let running: Promise<SyncOutcome> | null = null;
let queued = false;

export function requestSync(): Promise<SyncOutcome> {
  if (running) {
    queued = true;
    return running;
  }

  running = (async () => {
    try {
      return await runFullSync();
    } finally {
      running = null;
      if (queued) {
        queued = false;
        void requestSync();
      }
    }
  })();

  return running;
}
