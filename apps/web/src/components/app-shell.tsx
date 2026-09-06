'use client';

import { useCallback, useEffect, useState } from 'react';
import { BottomNav } from './bottom-nav';
import { AccountScreen } from './screens/account-screen';
import { HomeScreen } from './screens/home-screen';
import { InstallScreen } from './screens/install-screen';
import { MarkScreen } from './screens/mark-screen';
import { ReportsScreen } from './screens/reports-screen';
import { TraineeScreen } from './screens/trainee-screen';
import { isInternalNavigation, matchScreen } from '@/lib/local/route-match';
import { setNavigationListener } from '@/lib/local/shell-navigation';

/**
 * The app shell: one document that renders every screen in the field app.
 *
 * This is the whole offline strategy. The service worker precaches this one
 * page and answers EVERY navigation with it (see sw.ts), so which screen a
 * supervisor sees is decided here, from the url, on the device — never by the
 * server and never by which documents happened to be cached.
 *
 * That is what makes offline support a property of the app being installed
 * rather than a property of individual urls. A trainee added this morning, a
 * screen never opened before, a marking form for an instrument nobody on this
 * phone has touched: all work with no signal, because there was never a
 * per-url document that could be missing.
 *
 * THE ONE RULE THIS FILE MUST KEEP: the first render is route-independent.
 * The server prerenders this component for `/` and the worker replays those
 * same bytes at `/trainee/<id>`, so anything rendered before the effect below
 * runs must be identical for every url. Reading the path during render — with
 * `usePathname()`, say — would reintroduce exactly the hydration mismatch
 * that produced "Application error: a client-side exception has occurred" in
 * the previous design. Hence `pathname` starts null and is filled in on the
 * client.
 */

/** The four screens the prototype gives a bottom navigation bar. Marking is
 * excluded deliberately: one screen, one thing to tap (AGENTS.md), and a nav
 * bar there invites a supervisor to abandon a half-finished assessment. */
const NAV_SCREENS = new Set(['home', 'reports', 'account']);

export function AppShell() {
  const [pathname, setPathname] = useState<string | null>(null);

  useEffect(() => {
    setPathname(window.location.pathname);
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    const release = setNavigationListener(setPathname);
    return () => {
      window.removeEventListener('popstate', onPopState);
      release();
    };
  }, []);

  /**
   * Handles in-app links without a page load.
   *
   * A delegated listener rather than a custom Link component, so ordinary
   * `<a href>` markup keeps working everywhere — including inside screens
   * that know nothing about routing. Anything this does not claim (the
   * sign-in screen, a signed report url on Supabase Storage, a modified
   * click that means "open in a new tab") falls through to the browser
   * untouched.
   */
  const onClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const anchor = (event.target as HTMLElement | null)?.closest?.('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (!href || anchor.target === '_blank' || anchor.hasAttribute('download')) return;

    const url = new URL(href, window.location.href);
    if (!isInternalNavigation(url, window.location.origin)) return;

    event.preventDefault();
    window.history.pushState(null, '', url.pathname);
    setPathname(url.pathname);
    window.scrollTo(0, 0);
  }, []);

  // Route-independent first paint — see the note above. Blank rather than a
  // spinner: the device answers in milliseconds, and a spinner on every
  // navigation reads as slowness the app does not have.
  if (pathname === null) return <main className="min-h-dvh bg-[#eceff0]" />;

  const screen = matchScreen(pathname);

  return (
    // Click delegation only: every target is a real anchor and keeps its own
    // keyboard and focus behaviour, so there is nothing here to make
    // accessible that the anchors do not already provide.
    <div onClick={onClick}>
      {renderScreen(screen)}
      {NAV_SCREENS.has(screen.name) ? <BottomNav pathname={pathname} /> : null}
    </div>
  );
}

function renderScreen(screen: ReturnType<typeof matchScreen>) {
  switch (screen.name) {
    case 'install':
      return <InstallScreen />;
    case 'home':
      return <HomeScreen />;
    case 'trainee':
      return <TraineeScreen traineeId={screen.traineeId} />;
    case 'mark':
      return <MarkScreen traineeId={screen.traineeId} instrumentCode={screen.instrumentCode} />;
    case 'reports':
      return <ReportsScreen />;
    case 'account':
      return <AccountScreen />;
    default:
      return <NotFound />;
  }
}

function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#eceff0] p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm">
        <p className="text-teal-mid text-[12px] font-extrabold tracking-[0.7px]">TATHMINI</p>
        <h1 className="mt-2 text-[22px] font-bold text-neutral-900">Screen not found</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-[#5b6b78]">
          There is nothing at this address. Your route list and your marking forms are on this phone
          and work without signal.
        </p>
        <a
          href="/home"
          className="text-teal-mid mt-6 flex min-h-[48px] items-center justify-center rounded-xl border border-[#ccd7d4] text-[15px] font-semibold"
        >
          Back to my route
        </a>
      </div>
    </main>
  );
}
