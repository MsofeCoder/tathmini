'use client';

import { useEffect, useState } from 'react';
import { forgetReachability, isReachable, PROBE_TTL_MS } from '../reachability';

/**
 * Whether the College can be reached right now, live, shared by every screen
 * that needs to know.
 *
 * This exists because connectivity stopped being decoration. Nothing sends
 * itself any more (see `lib/send-pending.ts`), so "is there a connection" is
 * no longer a background detail the drainer worried about on the supervisor's
 * behalf — it decides which buttons a supervisor is offered. Offline they get
 * "Save a draft" and nothing else; online they also get "Submit". A button
 * that is offered and then fails is worse than a button that is not offered,
 * because the supervisor walks away believing the work went.
 *
 * ONE watcher for the whole app, not one per component. The banner, the send
 * control on a trainee, the marking form's footer and the Reports screen can
 * all be mounted at once, and four independent intervals probing a weak 3G
 * connection is a good way to make it weaker. `lib/reachability.ts` already
 * shares an in-flight probe and caches its answer for `PROBE_TTL_MS`; this
 * adds a single timer and a single set of listeners on top, so the cost is
 * the same whether one component asks or six.
 *
 * `checking` is a real state and is never rendered as either answer. On a
 * cold load, claiming "offline" for a quarter of a second hides the Submit
 * button from a supervisor standing on wifi; claiming "online" offers a
 * Submit that is about to fail. Callers reserve the space and wait — the
 * probe answers in milliseconds when cached, and immediately when
 * `navigator.onLine` is false.
 */
export type Reachability = 'checking' | 'online' | 'offline';

let current: Reachability = 'checking';
const listeners = new Set<(state: Reachability) => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function publish(next: Reachability): void {
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener(next);
}

async function check(): Promise<void> {
  publish((await isReachable()) ? 'online' : 'offline');
}

/**
 * Forces a fresh probe, ignoring the cached answer.
 *
 * Called on the browser's own `online`/`offline` events — which are better
 * information than anything remembered — and by a send that has just failed:
 * the fastest way to learn the connection died is to have tried to use it.
 */
export async function refreshReachability(): Promise<void> {
  forgetReachability();
  await check();
}

function onBrowserEvent(): void {
  void refreshReachability();
}

function start(): void {
  void check();
  window.addEventListener('online', onBrowserEvent);
  window.addEventListener('offline', onBrowserEvent);
  // A connection can die without the browser noticing — signal lost inside a
  // workshop, a data bundle running out mid-morning — and neither fires an
  // event. Re-checking on the probe's own cadence is what turns the banner on
  // (and the Submit button off) in those cases. The probe is cached, so this
  // is one tiny request a few times a minute, and none at all while offline.
  timer = setInterval(() => void check(), PROBE_TTL_MS * 3);
}

function stop(): void {
  window.removeEventListener('online', onBrowserEvent);
  window.removeEventListener('offline', onBrowserEvent);
  if (timer !== null) clearInterval(timer);
  timer = null;
  // The next mount starts from `checking` rather than from an answer that may
  // be minutes old — the phone has usually moved in between.
  current = 'checking';
}

export function subscribeReachability(listener: (state: Reachability) => void): () => void {
  const first = listeners.size === 0;
  listeners.add(listener);
  if (first) start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stop();
  };
}

export function useReachability(): Reachability {
  const [state, setState] = useState<Reachability>(() => current);

  useEffect(() => {
    setState(current);
    return subscribeReachability(setState);
  }, []);

  return state;
}
