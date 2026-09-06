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

export async function runFullSync(): Promise<SyncOutcome> {
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
