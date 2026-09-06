'use client';

import { usePathname } from 'next/navigation';
import { BottomNav } from './bottom-nav';
import { ConnectionWatcher } from './connection-watcher';

/**
 * The persistent shell: the no-signal banner above the page, the bottom
 * navigation below it. Wraps the page rather than sitting beside it so the
 * banner is genuinely the first thing on screen and the nav genuinely the
 * last, without either depending on where the page puts its own markup.
 *
 * The nav appears only on the top-level screens the prototype gives it
 * (reference/Tathmini.dc.html's `showNav`). It is absent while marking, while
 * signing in, and on the install screen — the marking flow in particular is
 * "one screen, one thing to tap" (AGENTS.md), and a nav bar there invites a
 * supervisor to walk away from a half-finished assessment.
 *
 * /offline counts as the Trainees tab: it IS the route list, without signal.
 * /pending is kept because the service worker has precached it on phones
 * already running the app; it redirects into the Reports tab, and keeping the
 * bar there stops the shell flickering on the way through.
 */
const NAV_PATHS = new Set(['/home', '/reports', '/pending', '/account', '/offline']);

export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showNav = NAV_PATHS.has(pathname);

  return (
    <>
      <ConnectionWatcher />
      {children}
      {showNav ? <BottomNav /> : null}
    </>
  );
}
