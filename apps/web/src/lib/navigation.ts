/**
 * Pure navigation rules shared by the app shell. Kept out of the components
 * so they can be tested without a DOM or Next's router — the redirect guard
 * in particular is the one piece of the auto-switch that can destroy work.
 */

/**
 * Screens the connection watcher must NOT move a supervisor away from when
 * the signal drops.
 *
 * The marking flow is the important one. It is client-rendered and keeps
 * working with no signal, drafts and all; navigating away to "helpfully" show
 * the offline screen would throw away what is on screen mid-trainee. Signal
 * flaps constantly in the field, so this would fire often. It is the same
 * reasoning that disabled Serwist's `reloadOnOnline` (see next.config.ts).
 *
 * The sign-in screens are protected too: a supervisor with no signal cannot
 * sign in anyway, and bouncing them to /offline would hide the reason.
 */
export function isProtectedFromRedirect(pathname: string): boolean {
  return (
    pathname.startsWith('/trainee/') ||
    pathname === '/offline' ||
    pathname === '/login' ||
    pathname === '/change-password' ||
    pathname === '/'
  );
}

/**
 * Which bottom-nav tab a path belongs to. /offline IS the route list without
 * signal, so it highlights Trainees — the nav must not suggest the supervisor
 * has left the section they are standing in.
 */
export function activeNavHref(pathname: string): string {
  return pathname === '/offline' ? '/home' : pathname;
}
