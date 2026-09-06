/**
 * Which screen a path means.
 *
 * This is the whole routing table of the field app, as a pure function, and
 * it exists because the app is now a single precached document that answers
 * EVERY navigation. Nothing about which screen to show can come from the
 * server any more — the server sent the same bytes whatever the url — so it
 * comes from here.
 *
 * That is the point of the app-shell model rather than a weakness. The three
 * offline failures this project has had all came from the opposite design,
 * caching one document per url:
 *
 *   - a fallback document served at another route's url, which App Router
 *     refused to hydrate ("Application error");
 *   - a rewrite that moved the trainee id into a query string the browser
 *     never sees, so every profile reported "not on your route";
 *   - a per-url cache that only held the screens somebody had happened to
 *     open online, so the rest fell through to the offline page.
 *
 * With one document there is no per-url cache to be incomplete, and no
 * other route's payload to mismatch against. A screen the supervisor has
 * never opened, for a trainee added this morning, works offline — because
 * offline support stopped being a property of urls and became a property of
 * the app being installed at all.
 */

export type Screen =
  | { name: 'install' }
  | { name: 'home' }
  | { name: 'trainee'; traineeId: string }
  | { name: 'mark'; traineeId: string; instrumentCode: string }
  | { name: 'pending' }
  | { name: 'account' }
  | { name: 'not-found' };

/** Paths that belong to the shell. Anything else is a real server route
 * (sign-in, the API, the report preview) and must reach the network. */
export function isShellPath(pathname: string): boolean {
  return matchScreen(pathname).name !== 'not-found' || pathname === '/moves';
}

export function matchScreen(pathname: string): Screen {
  // Trailing slashes are equivalent, and an empty path is the root.
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

  if (path === '' || path === '/') return { name: 'install' };
  if (path === '/home') return { name: 'home' };
  if (path === '/pending') return { name: 'pending' };
  if (path === '/account') return { name: 'account' };

  // Checked before the profile pattern, which also starts /trainee/.
  const mark = /^\/trainee\/([^/]+)\/mark\/([^/]+)$/.exec(path);
  if (mark?.[1] && mark[2]) {
    return {
      name: 'mark',
      traineeId: decodeURIComponent(mark[1]),
      instrumentCode: decodeURIComponent(mark[2]),
    };
  }

  const profile = /^\/trainee\/([^/]+)$/.exec(path);
  if (profile?.[1]) {
    return { name: 'trainee', traineeId: decodeURIComponent(profile[1]) };
  }

  return { name: 'not-found' };
}

/**
 * Whether a link should be handled by the in-app router rather than by a full
 * page load.
 *
 * `/admin/**` is deliberately NOT a shell path: the administration console is
 * server-rendered, reads the whole cohort, and is the one part of the app that
 * genuinely wants the network. `isShellPath` already excludes it, because
 * `matchScreen` does not recognise it — this note exists so that stays true on
 * purpose rather than by accident.
 *
 * Full navigations would work — the service worker answers each one from the
 * same shell — but they reboot React, which means re-reading IndexedDB and,
 * worse, tearing down and rebuilding the Realtime socket on every tap. On a
 * route walk that is dozens of reconnects. Anything that is NOT a shell path
 * (sign-in, a signed report url) is left to the browser.
 */
export function isInternalNavigation(url: URL, origin: string): boolean {
  return url.origin === origin && isShellPath(url.pathname);
}
