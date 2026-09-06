'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { activeNavHref } from '@/lib/navigation';
import { listQueued } from '@/lib/outbox';
import { listReportDrafts } from '@/lib/report-drafts';
import { listQueuedReports } from '@/lib/report-outbox';

/**
 * The bottom navigation: Trainees · Reports · Account, with the count appended
 * to a label when there is something waiting — the prototype's own
 * `'Pending · ' + pendingN` treatment (reference/Tathmini.dc.html lines
 * 967-985), now carried by Reports.
 *
 * Shown only on the top-level screens. It is deliberately absent while
 * marking: that flow is one screen, one thing to tap (AGENTS.md's UI rules),
 * and a nav bar there invites a supervisor to leave a half-finished
 * assessment.
 *
 * TWO CHANGES FROM THE PROTOTYPE'S BAR, both deliberate:
 *
 * - MOVES IS GONE. It was rendered inert, on the reasoning that the bar should
 *   not change shape when Phase 3's reassignment state machine lands. In the
 *   field a disabled quarter of the bar is not read as "coming later", it is
 *   read as broken, and it costs a thumb-width of the three tabs that do work.
 *   The supervisor-initiated half of reassignment is still unbuilt; when it
 *   lands it gets its tab back.
 * - PENDING IS NOW REPORTS. Pending was only ever the two kinds of waiting;
 *   the assessments that went through — the common case — had no screen at
 *   all. Reports carries all three (Drafted · Submitted · Pending) and keeps
 *   the waiting count on the label, so nothing that used to be visible here
 *   has become less visible.
 */

interface Tab {
  href: string;
  label: string;
  /** The prototype gives each tab its own icon silhouette via border-radius. */
  radius: string;
}

const TABS: Tab[] = [
  { href: '/home', label: 'Trainees', radius: '4px' },
  { href: '/reports', label: 'Reports', radius: '50%' },
  { href: '/account', label: 'Account', radius: '50% 50% 4px 4px' },
];

export function BottomNav() {
  const pathname = usePathname();
  const [waiting, setWaiting] = useState(0);

  useEffect(() => {
    // Read on every navigation: a submission queued on the marking screen has
    // to show up here the moment the supervisor comes back.
    //
    // Held reports count too. They are a different kind of waiting — nothing
    // sends them on its own — but from the bar's point of view all three are
    // "work finished on this phone that has not reached the College", and a
    // report saved as a draft is precisely the thing a supervisor forgets.
    // Submitted work is deliberately not counted: a badge that climbed all
    // week would stop meaning anything.
    void Promise.all([listQueued(), listReportDrafts(), listQueuedReports()]).then(
      ([queued, drafts, queuedReports]) =>
        setWaiting(queued.length + drafts.length + queuedReports.length),
    );
  }, [pathname]);

  const current = activeNavHref(pathname);

  return (
    <nav aria-label="Main" className="sticky bottom-0 z-40 flex border-t border-[#dfe6ec] bg-white">
      {TABS.map((tab) => {
        const on = current === tab.href;
        const label =
          tab.href === '/reports' && waiting > 0 ? `${tab.label} · ${waiting}` : tab.label;

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
