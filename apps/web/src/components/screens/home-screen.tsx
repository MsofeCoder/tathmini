'use client';

import { useEffect } from 'react';
import { signOut } from '@/app/home/actions';
import { RouteList } from '@/app/home/route-list';
import { buildRouteRows } from '@/lib/local/derive';
import { useDeviceRows } from '@/lib/local/use-device';

/**
 * The supervisor's route list — rendered entirely from the device.
 *
 * It used to be a Server Component running seven Supabase queries behind a
 * middleware call to `auth.getUser()`, which was itself a network round trip
 * to Cape Town: measured at 713 ms TTFB from a good connection, before a
 * supervisor's own 3G hop. Now it is seven IndexedDB reads and the network is
 * not on the path at all. Same markup, same counters, same copy — the
 * derivation lives in `lib/local/derive.ts`, unchanged and finally testable.
 *
 * A non-supervisor is sent onward, preserving the branch the server render
 * used to make: a coordinator to /coordinator, anyone else to /admin. A
 * coordinator's whole role is oversight, so they land on the read-only
 * dashboard rather than a console whose every control is disabled for them.
 *
 * Both are REAL navigations, not in-shell ones. /coordinator and /admin are
 * server-rendered on purpose — the whole cohort, aggregates, exports and the
 * audit log are the wrong shape for a device replica — and `isShellPath()`
 * claims neither, so the service worker leaves them to the network.
 *
 * Nothing bounces: /admin and /coordinator both send a supervisor here, and
 * this sends everyone else there.
 */
export function HomeScreen() {
  const rows = useDeviceRows();
  const trainees = rows ? buildRouteRows(rows) : [];
  const role = rows?.session?.role;

  useEffect(() => {
    // Waits for the device read: `role` is undefined until IndexedDB answers,
    // and redirecting on that would bounce a supervisor to a console they
    // cannot use.
    if (!role || role === 'supervisor') return;
    window.location.assign(role === 'coordinator' ? '/coordinator' : '/admin');
  }, [role]);

  return (
    <div>
      <RouteList
        routeCode={rows?.session?.routeCode ?? 'MY ROUTE'}
        routeLabel={rows?.session?.routeLabel ?? null}
        trainees={trainees}
        /* Undefined until the first read resolves, so the list can tell
           "nothing here yet" from "your route is empty" — the second is a
           claim that would frighten a supervisor standing in a village. */
        loaded={rows !== undefined}
        syncedAt={rows?.session?.syncedAt ?? null}
      />
      <div className="p-4">
        <form action={signOut}>
          <button
            type="submit"
            className="focus:outline-accent min-h-[48px] w-full rounded-xl border border-[#e0b6ab] bg-white text-[15px] font-semibold text-[#8a3a2a] focus:outline focus:outline-[3px] focus:outline-offset-2"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
