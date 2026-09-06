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

  if (replace) window.history.replaceState(null, '', pathname);
  else window.history.pushState(null, '', pathname);

  listener(pathname);
  // A pushed screen starts at the top. Without this, opening a trainee from
  // halfway down a long route list drops the supervisor halfway down their
  // profile.
  window.scrollTo(0, 0);
}
