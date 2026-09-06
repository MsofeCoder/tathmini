'use client';

import { buildRouteRows } from '@/lib/local/derive';
import { useDeviceRows } from '@/lib/local/use-device';
import { signOut } from './actions';
import { RouteList } from './route-list';

/**
 * The supervisor's route list — the same screen, now rendered from the
 * device.
 *
 * It used to be a Server Component running seven Supabase queries behind a
 * middleware call to `auth.getUser()`, which was itself a network round trip
 * to Cape Town: measured at 713 ms TTFB from a good connection, before a
 * supervisor's own 3G hop. Now it is seven IndexedDB reads, and the network
 * is not on the path at all. Same markup, same counters, same copy — the
 * derivation moved to `lib/local/derive.ts`, unchanged, where it is finally
 * testable.
 *
 * The role branch that used to live here is gone with the server render. The
 * Coordinator and Super Admin dashboards are unbuilt Phase 3 work, and a
 * non-supervisor signing in now lands on an empty route list rather than a
 * placeholder — which is honest: they have no assignments, so they have no
 * trainees. Their real screens are a separate phase.
 */
export default function HomePage() {
  const rows = useDeviceRows();
  const trainees = rows ? buildRouteRows(rows) : [];

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
