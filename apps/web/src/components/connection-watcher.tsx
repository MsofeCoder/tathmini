'use client';

import { useEffect, useState } from 'react';
import { forgetReachability, isReachable, PROBE_TTL_MS } from '@/lib/reachability';

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
 * one thing only: whether the supervisor should expect their work to have
 * left the phone yet. That is what the banner says, and it is all it says.
 *
 * It reports REACHABILITY, not `navigator.onLine` — see lib/reachability.ts
 * for why the difference is the normal case here rather than an edge case.
 */
export function ConnectionWatcher() {
  // Assume reachable until proven otherwise: flashing a "no signal" banner
  // for a moment on every cold load would train supervisors to ignore it.
  const [reachable, setReachable] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const result = await isReachable();
      if (!cancelled) setReachable(result);
    };

    // The browser's own events are better information than any cached probe
    // answer, so drop the cache before re-checking on one.
    const onEvent = () => {
      forgetReachability();
      void check();
    };

    void check();
    window.addEventListener('online', onEvent);
    window.addEventListener('offline', onEvent);

    // A connection can die without the browser noticing — signal lost inside
    // a workshop, a data bundle running out mid-morning — and neither fires
    // an event. Re-checking on the probe's own cadence is what turns the
    // banner on in those cases; the probe itself is cached, so this is one
    // tiny request a few times a minute, and none at all while offline.
    const timer = setInterval(() => void check(), PROBE_TTL_MS * 3);

    return () => {
      cancelled = true;
      window.removeEventListener('online', onEvent);
      window.removeEventListener('offline', onEvent);
      clearInterval(timer);
    };
  }, []);

  if (reachable) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 bg-[#6b4400] px-4 py-1.5 text-center text-[12px] font-bold tracking-[0.4px] text-white"
    >
      NO SIGNAL — your work is saved on this phone
    </div>
  );
}
