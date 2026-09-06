'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { activeNavHref } from '@/lib/navigation';
import { listQueued } from '@/lib/outbox';
import { listReportDrafts } from '@/lib/report-drafts';

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

export function BottomNav() {
  const pathname = usePathname();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    // Read on every navigation: a submission queued on the marking screen has
    // to show up here the moment the supervisor comes back.
    //
    // Held reports count too. They are a different kind of waiting — nothing
    // sends them on its own — but from the bar's point of view both are "work
    // finished on this phone that has not reached the College", and a report
    // saved as a draft is precisely the thing a supervisor forgets.
    void Promise.all([listQueued(), listReportDrafts()]).then(([queued, drafts]) =>
      setPendingCount(queued.length + drafts.length),
    );
  }, [pathname]);

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

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={on ? 'page' : undefined}
            className={`${shared} ${tone}`}
          >
            {inner}
          </Link>
        );
      })}
    </nav>
  );
}
