'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { readDeviceRows } from '@/lib/local/use-device';
import { forgetReachability, isReachable } from '@/lib/reachability';
import { requestSync } from '@/lib/sync/client';
import { startRealtime } from '@/lib/sync/realtime';

/**
 * Keeps the device's copy current, for as long as the app is open.
 *
 * Mounted once in the root layout, so it runs on every screen — the point of
 * a local-first app is that a supervisor never has to visit a particular page
 * to make their data fresh. Two things keep it in step:
 *
 * 1. **Realtime**, always on. A change to this supervisor's rows is written
 *    into IndexedDB as it happens, and `liveQuery` re-renders whatever screen
 *    is open. This is the mechanism; the other two exist because a socket
 *    cannot cover every case.
 * 2. **A full sync** on open, on regaining focus, and when the connection
 *    comes back — because Realtime is not a durable log. Nothing that changed
 *    while the phone was in a dead zone was queued for it, so a reconnected
 *    socket has a hole behind it that only a refill closes.

 * The sign-in screens are excluded. A supervisor who is not signed in has no
 * rows to sync, and asking would just produce a 401 that reads as an expired
 * session.
 */

const SIGNED_OUT_PATHS = new Set(['/', '/login']);
const CHANGE_PASSWORD = '/change-password';

export function SyncProvider() {
  const router = useRouter();
  const pathname = usePathname();
  const active = !SIGNED_OUT_PATHS.has(pathname);

  // Refs, not dependencies, so the sync effect below does not tear down and
  // rebuild the socket every time the supervisor opens a trainee.
  const activeRef = useRef(active);
  activeRef.current = active;
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => {
    if (!active) return;

    let cancelled = false;

    const sync = async () => {
      if (cancelled || !activeRef.current) return;
      // Ask the network only when there is a network. Skipping the probe
      // would mean a failed fetch on every focus change in a dead zone,
      // which is most of a working day on some routes.
      if (!(await isReachable())) return;

      const outcome = await requestSync();
      if (cancelled) return;

      if (outcome === 'unauthenticated') {
        // The session is genuinely gone — the server said so, which means it
        // was reachable. Anything else leaves the device alone.
        window.location.assign('/login');
        return;
      }

      if (outcome === 'synced') {
        const rows = await readDeviceRows();
        if (cancelled) return;
        // Guarded on the current path: without it, every sync while the
        // supervisor is ON the change-password screen would replace the route
        // with itself, on focus, on reconnect and on every Realtime nudge.
        if (rows.session?.mustChangePassword && pathnameRef.current !== CHANGE_PASSWORD) {
          window.location.assign(CHANGE_PASSWORD);
          return;
        }
      }
    };

    void sync();

    // A new `online`/`offline` event is better information than any cached
    // probe answer, so drop the cache before acting on it.
    const onConnectivityChange = () => {
      forgetReachability();
      void sync();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void sync();
    };

    window.addEventListener('online', onConnectivityChange);
    window.addEventListener('offline', forgetReachability);
    document.addEventListener('visibilitychange', onVisible);

    const realtime = startRealtime({ onResyncNeeded: () => void sync() });

    return () => {
      cancelled = true;
      window.removeEventListener('online', onConnectivityChange);
      window.removeEventListener('offline', forgetReachability);
      document.removeEventListener('visibilitychange', onVisible);
      realtime?.stop();
    };
    // `pathname` is deliberately absent from the dependencies — it is read
    // through activeRef instead. Re-subscribing on every navigation would drop
    // and rebuild the socket dozens of times on a route walk.
  }, [active, router]);

  return null;
}
