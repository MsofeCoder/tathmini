/**
 * In-app navigation for the shell.
 *
 * The field app is one precached document that answers every navigation, so
 * moving between screens is a `history.pushState` and a re-render, not a page
 * load. A full load would work — the service worker would hand back the same
 * shell — but it reboots React, re-reads IndexedDB and, worst of all, tears
 * down and rebuilds the Realtime socket. On a route walk that is dozens of
 * reconnects for no gain.
 *
 * Deliberately not `next/navigation`'s router: that fetches the target
 * route's payload from the server, which is precisely what cannot happen with
 * no signal. Its `usePathname` also would not see these pushStates.
 *
 * A single listener, owned by the shell, because there is exactly one shell.
 */

type Listener = (pathname: string) => void;

let listener: Listener | null = null;

/**
 * Where we are in the history stack.
 *
 * `popstate` says a navigation happened but not which way it went, and the
 * shell has to know: a BACK is corrected to the canonical parent screen (see
 * `parentScreenPath`), a FORWARD must be left alone. So every entry the shell
 * creates carries its own depth, and comparing the popped entry's depth with
 * the one we were on gives the direction.
 *
 * Kept under a namespaced key because `history.state` is shared with anything
 * else that writes it, and read back from the entry itself so it survives a
 * reload — the phone restoring a session mid-route must not decide it is at
 * depth 0 and start treating every Back as a forward move.
 */
const DEPTH_KEY = 'tathminiDepth';

let depth = 0;

function depthOf(state: unknown): number | null {
  if (typeof state !== 'object' || state === null) return null;
  const value = (state as Record<string, unknown>)[DEPTH_KEY];
  return typeof value === 'number' ? value : null;
}

/** Stamps the entry the app was opened on, so the first Back has something to
 * compare against. The shell calls this once, on mount. */
export function initHistoryDepth(): void {
  if (typeof window === 'undefined') return;
  const existing = depthOf(window.history.state);
  if (existing !== null) {
    depth = existing;
    return;
  }
  depth = 0;
  const state = (window.history.state as Record<string, unknown> | null) ?? {};
  window.history.replaceState({ ...state, [DEPTH_KEY]: 0 }, '');
}

/**
 * Which way a `popstate` went.
 *
 * Also adopts the popped entry's depth, so the next comparison is made from
 * where we actually are. An entry with no stamp (something outside the shell
 * wrote it) is treated as a backward move: those only arise below the app's
 * own entries, which is behind us.
 */
export function readPopDirection(state: unknown): 'back' | 'forward' {
  const next = depthOf(state);
  const previous = depth;
  depth = next ?? Math.max(0, previous - 1);
  return next === null || next < previous ? 'back' : 'forward';
}

/** Rewrites the entry we have just landed on, without adding another. Used by
 * the shell when a Back has to be redirected to the canonical parent screen:
 * pressing Back again must then leave from the parent, not bounce. */
export function replaceCurrent(pathname: string): void {
  if (typeof window === 'undefined') return;
  window.history.replaceState({ [DEPTH_KEY]: depth }, '', pathname);
}

/** The shell registers itself here on mount. Returns the unsubscribe. */
export function setNavigationListener(next: Listener): () => void {
  listener = next;
  return () => {
    if (listener === next) listener = null;
  };
}

export interface NavigateOptions {
  /** Replace the current entry instead of pushing — used when a screen
   * redirects on its own, so Back does not return to the screen that just
   * sent the supervisor away. */
  replace?: boolean;
}

/**
 * Move to another screen inside the shell.
 *
 * Falls back to a real navigation when no shell is mounted (nothing to
 * re-render) — that keeps this safe to call from anywhere.
 */
export function navigateTo(pathname: string, { replace = false }: NavigateOptions = {}): void {
  if (typeof window === 'undefined') return;

  if (!listener) {
    window.location.assign(pathname);
    return;
  }

  if (replace) {
    window.history.replaceState({ [DEPTH_KEY]: depth }, '', pathname);
  } else {
    depth += 1;
    window.history.pushState({ [DEPTH_KEY]: depth }, '', pathname);
  }

  listener(pathname);
  // A pushed screen starts at the top. Without this, opening a trainee from
  // halfway down a long route list drops the supervisor halfway down their
  // profile.
  window.scrollTo(0, 0);
}
