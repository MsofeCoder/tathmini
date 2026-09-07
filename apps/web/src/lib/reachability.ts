/**
 * Whether the server can actually be reached — as opposed to whether the
 * phone has a radio, which is all `navigator.onLine` reports.
 *
 * The difference is not academic here. `navigator.onLine` is true on a
 * workshop wifi that routes nowhere, on a hotspot whose data bundle has run
 * out, and on a 3G connection that has associated but is passing no packets.
 * All three are normal on a College route, and in all three the app used to
 * believe it was online: it left the "NO SIGNAL" banner off, let a supervisor
 * tap through to a screen that needed the network, and drained the outbox
 * into a connection that could not carry it.
 *
 * The asymmetry is deliberate. `navigator.onLine === false` is trusted
 * outright — the browser is telling us there is no interface at all, and
 * nothing is gained by spending four seconds proving it. `true` is treated as
 * a claim to be checked.
 */

/** How long a probe may take before the connection counts as unusable. On 3G
 * a real response arrives well inside this; a dead connection never answers. */
export const PROBE_TIMEOUT_MS = 4_000;

/**
 * How long a probe's answer is trusted before asking again. Long enough that
 * a screen re-rendering, an outbox drain and a sync in the same moment cost
 * one request rather than three; short enough that walking back into coverage
 * is noticed while the supervisor is still holding the phone.
 */
export const PROBE_TTL_MS = 10_000;

export interface ProbeCache {
  reachable: boolean;
  at: number;
}

/** Whether a cached probe answer may still be used. Pure, so the caching rule
 * is tested rather than inferred from a component's timing. */
export function isFresh(cache: ProbeCache | null, now: number, ttl = PROBE_TTL_MS): boolean {
  return cache !== null && now - cache.at < ttl;
}

export interface ReachabilityDeps {
  /** `navigator.onLine`, injected so the decision is testable. */
  online: () => boolean;
  /** Performs the probe; resolves true if the server answered at all. */
  probe: () => Promise<boolean>;
  now: () => number;
}

let cache: ProbeCache | null = null;
let inFlight: Promise<boolean> | null = null;

/**
 * The decision, with every effect injected.
 *
 * A probe already in flight is shared rather than duplicated: an `online`
 * event typically wakes the drainer, the sync loop and the banner in the same
 * tick, and three simultaneous probes on a weak connection are three ways to
 * make it weaker.
 */
export async function checkReachable(deps: ReachabilityDeps): Promise<boolean> {
  if (!deps.online()) {
    // No interface. Record it like any other answer so the next caller in
    // this tick does not probe either.
    cache = { reachable: false, at: deps.now() };
    return false;
  }

  if (isFresh(cache, deps.now())) return cache!.reachable;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    let reachable = false;
    try {
      reachable = await deps.probe();
    } catch {
      reachable = false;
    }
    cache = { reachable, at: deps.now() };
    inFlight = null;
    return reachable;
  })();

  return inFlight;
}

/** Drops the cached answer. Called when the browser fires `online`/`offline`,
 * which is new information and beats anything remembered. */
export function forgetReachability(): void {
  cache = null;
}

/**
 * The real probe: a tiny request to our own origin.
 *
 * `/api/ping` rather than a HEAD of some page, because everything under
 * `/api` is `NetworkOnly` in the service worker (sw.ts). A probe answered
 * from a cache would report the network as healthy precisely when it is not,
 * which is the failure this whole module exists to prevent.
 */
async function defaultProbe(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch('/api/ping', {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    // Any answer proves the round trip completed. A 401 means the session
    // expired, which is a different problem with a different fix — and the
    // server was plainly reachable to say so.
    return response.ok || response.status === 401;
  } finally {
    clearTimeout(timer);
  }
}

/** The browser-facing call. */
export function isReachable(): Promise<boolean> {
  return checkReachable({
    online: () => (typeof navigator === 'undefined' ? true : navigator.onLine),
    probe: defaultProbe,
    now: () => Date.now(),
  });
}
