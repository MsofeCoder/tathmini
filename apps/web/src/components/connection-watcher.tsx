'use client';

import { useReachability } from '@/lib/local/use-reachable';

/**
 * The "NO SIGNAL" banner — and, since the local-first rebuild, nothing else.
 *
 * It used to REDIRECT. Every screen was server-rendered, so when the
 * connection dropped the app moved the supervisor to `/offline` before they
 * could tap into a navigation that would fail. That was a workaround for
 * screens that could not render without a network, and it caused as much
 * trouble as it prevented: it fired on `navigator.onLine`, which is true on a
 * workshop wifi that routes nowhere, so it both missed the case it existed
 * for and interrupted supervisors when signal flapped. `/trainee/**` had to
 * be excluded from it to stop it throwing away half-finished assessments,
 * which meant the crash it was meant to prevent was still reachable from
 * exactly the screens that mattered.
 *
 * There is nothing left to redirect to or from. Every screen reads the device
 * and renders the same with or without a connection, so losing signal changes
 * one thing only: whether work can leave the phone. That is what the banner
 * says, and it is all it says.
 *
 * The probe itself moved to `lib/local/use-reachable.ts` when the app stopped
 * sending anything on its own: the send controls now gate on exactly the same
 * answer this banner renders, and two watchers that could disagree would put
 * a Submit button on screen underneath a NO SIGNAL bar.
 *
 * It reports REACHABILITY, not `navigator.onLine` — see lib/reachability.ts
 * for why the difference is the normal case here rather than an edge case.
 */
export function ConnectionWatcher() {
  const reachability = useReachability();

  // `checking` renders nothing: flashing a "no signal" banner for a moment on
  // every cold load would train supervisors to ignore it.
  if (reachability !== 'offline') return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 bg-[#6b4400] px-4 py-1.5 text-center text-[12px] font-bold tracking-[0.4px] text-white"
    >
      NO SIGNAL — save a draft; send it when you are back online
    </div>
  );
}
