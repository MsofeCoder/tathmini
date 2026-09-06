import type { SyncStatus } from '../sync/client';

/**
 * The one line under the route list's progress bar, and whether to offer a
 * retry beside it.
 *
 * This is a bigger decision than a sentence usually deserves, because an empty
 * route list has four completely different meanings and the app had only one
 * sentence for all of them. A supervisor upgrading from the previous build had
 * a valid session and an empty IndexedDB; `/home` read the device in a couple
 * of milliseconds, found nothing, and told them their route had not reached
 * the phone — while the sync that was fetching it was still in flight. If that
 * sync then failed, the same sentence stayed on screen forever with nothing to
 * press.
 *
 * So each state gets its own words, and a retry appears only where pressing it
 * could change the answer:
 *
 *   still reading the phone    wait, silently
 *   downloading                wait, and say so
 *   could not reach the server say so, offer a retry
 *   session gone               say so; the app is already redirecting
 *   genuinely no trainees      say so, and DO NOT offer a retry — the College
 *                              record is what it is, and a button there would
 *                              suggest the app was broken rather than the
 *                              roster empty
 *
 * Pure, because it is the sentence a supervisor decides what to do next on.
 */
export interface RouteStatusInput {
  /** False until the device's first IndexedDB read resolves. */
  loaded: boolean;
  traineeCount: number;
  /** Trainees not yet assessed by this supervisor. */
  outstanding: number;
  /** When this device last heard from the server; null if it never has. */
  syncedAt: number | null;
  syncStatus: SyncStatus;
}

export interface RouteStatusMessage {
  text: string;
  canRetry: boolean;
}

export function emptyRouteMessage({
  loaded,
  traineeCount,
  outstanding,
  syncedAt,
  syncStatus,
}: RouteStatusInput): RouteStatusMessage {
  if (!loaded) {
    return { text: 'Reading your route from this phone…', canRetry: false };
  }

  if (traineeCount > 0) {
    return {
      text:
        outstanding === 0
          ? 'Route complete — you have assessed every trainee.'
          : `${outstanding} still to assess`,
      canRetry: false,
    };
  }

  // Empty, and the reason matters.
  if (syncStatus === 'syncing') {
    return { text: 'Downloading your route from the College…', canRetry: false };
  }

  if (syncStatus === 'signed-out') {
    return { text: 'Your session has expired. Sign in again to load your route.', canRetry: false };
  }

  // Never heard from the server, and not trying right now.
  if (syncedAt === null) {
    return {
      text:
        syncStatus === 'unreachable'
          ? 'Could not reach the College server, so your route is not on this phone yet.'
          : 'Your route has not reached this phone yet.',
      canRetry: true,
    };
  }

  // Synced successfully, and the College really does have nobody on this
  // route. No retry: the answer would not change, and offering one implies
  // the app is at fault.
  return { text: 'No trainees assigned to this route yet.', canRetry: false };
}
