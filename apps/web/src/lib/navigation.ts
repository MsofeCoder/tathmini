/**
 * Pure navigation rules shared by the app shell.
 *
 * `isProtectedFromRedirect` used to live here — the list of screens the
 * connection watcher must not move a supervisor away from when signal
 * dropped. It is gone with the redirect itself: every screen now renders from
 * the device, so there is no longer an offline screen to be moved to, and
 * nothing to be protected from. (See connection-watcher.tsx.)
 *
 * The routing table itself lives in `lib/local/route-match.ts` — the app is
 * one precached shell, so which screen a path means is decided on the device.
 */

/**
 * Which bottom-nav tab a path belongs to.
 *
 * A trainee profile and a marking screen are reached FROM the route list and
 * belong to it, so the Trainees tab stays lit while a supervisor is inside
 * one — the nav must never suggest they have left the section they are
 * standing in. Marking hides the nav entirely (see app-shell.tsx's
 * NAV_SCREENS), so that case only matters for the profile.
 */
export function activeNavHref(pathname: string): string {
  if (pathname.startsWith('/trainee')) return '/home';
  return pathname;
}
