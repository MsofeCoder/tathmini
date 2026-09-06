'use client';

import { activeNavHref } from '@/lib/navigation';
import { usePendingCount } from '@/lib/local/use-device';

/**
 * The prototype's bottom navigation (reference/Tathmini.dc.html lines
 * 967-985): Trainees · Moves · Pending · Account, in that order, with the
 * count appended to a label when there is something waiting — the prototype's
 * own `'Pending · ' + pendingN` treatment.
 *
 * Shown only on the four top-level screens. It is deliberately absent while
 * marking: that flow is one screen, one thing to tap (AGENTS.md's UI rules),
 * and a nav bar there invites a supervisor to leave a half-finished
 * assessment.
 *
 * Moves is present but inert — the reassignment state machine is Phase 3 and
 * unbuilt. It is rendered disabled rather than hidden so the bar does not
 * change shape when that phase lands, and so nobody wonders where it went.
 */

interface Tab {
  href: string;
  label: string;
  /** The prototype gives each tab its own icon silhouette via border-radius. */
  radius: string;
  disabled?: boolean;
}

const TABS: Tab[] = [
  { href: '/home', label: 'Trainees', radius: '4px' },
  { href: '/moves', label: 'Moves', radius: '4px 50% 4px 50%', disabled: true },
  { href: '/pending', label: 'Pending', radius: '50%' },
  { href: '/account', label: 'Account', radius: '50% 50% 4px 4px' },
];

/**
 * The path is a PROP, not `usePathname()`. The shell navigates with
 * `history.pushState`, which `next/navigation` cannot see — reading the path
 * from that hook here would leave the bar stuck highlighting whichever tab
 * the app was opened on.
 */
export function BottomNav({ pathname }: { pathname: string }) {
  // Live from IndexedDB, and counting held reports as well as queued
  // assessments — see usePendingCount(). The count has to fall the moment the
  // outbox drains and rise the moment something is queued or held back,
  // without this bar being remounted.
  const pendingCount = usePendingCount();

  const current = activeNavHref(pathname);

  return (
    <nav aria-label="Main" className="sticky bottom-0 z-40 flex border-t border-[#dfe6ec] bg-white">
      {TABS.map((tab) => {
        const on = current === tab.href;
        const label =
          tab.href === '/pending' && pendingCount > 0 ? `Pending · ${pendingCount}` : tab.label;

        const inner = (
          <>
            <span
              aria-hidden="true"
              className="h-4 w-4 border-2 border-current"
              style={{ borderRadius: tab.radius, background: on ? 'currentColor' : 'transparent' }}
            />
            <span className="text-[11px] font-semibold">{label}</span>
          </>
        );

        const shared =
          'flex min-h-[62px] flex-1 flex-col items-center justify-center gap-[5px] border-t-[3px] focus:outline focus:outline-[3px] focus:outline-[#a35c00] focus:-outline-offset-[3px]';
        const tone = on
          ? 'border-[#12665b] bg-[#f1f6f4] text-[#0d4a43] font-bold'
          : 'border-transparent text-[#4d5f6c]';

        if (tab.disabled) {
          return (
            <button
              key={tab.href}
              type="button"
              disabled
              // Phase 3. Says so rather than failing silently on tap.
              title="Trainee moves are not built yet"
              className={`${shared} border-transparent text-[#4d5f6c] opacity-40`}
            >
              {inner}
            </button>
          );
        }

        // A plain anchor, not next/link. A client-side navigation fetches the
        // target route's payload from the server, which fails with no signal
        // and takes the app down with it — the very thing this rebuild
        // removes. A full navigation is answered by the service worker from
        // the cached shell, so every tab works offline. Nothing is lost: the
        // screens carry no server data, so there is no round trip to save.
        return (
          <a
            key={tab.href}
            href={tab.href}
            aria-current={on ? 'page' : undefined}
            className={`${shared} ${tone}`}
          >
            {inner}
          </a>
        );
      })}
    </nav>
  );
}
