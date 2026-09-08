'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Console navigation. A client component for one reason only — the current
 * path decides which tab is marked, and `usePathname()` is the only way to
 * know that without threading the path through every page.
 */
const TABS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/trainees', label: 'Trainees' },
  { href: '/admin/routes', label: 'Routes' },
  { href: '/admin/users', label: 'Accounts' },
  { href: '/admin/results', label: 'Results' },
  { href: '/admin/requests', label: 'Requests' },
  { href: '/admin/audit', label: 'Audit trail' },
  { href: '/admin/maintenance', label: 'Backup' },
  { href: '/coordinator', label: 'Overview (Coordinator view)' },
];

/**
 * `pendingRequests` is counted in the layout and passed down, because a badge
 * on a tab is the only thing that makes a request queue an inbox. Without it
 * a supervisor's correction sits behind a tab that looks exactly like it does
 * when there is nothing there — and the request that goes unread is the one
 * saying a trainee's result is about to reach the wrong person.
 *
 * Zero renders nothing at all. A badge showing "0" trains an administrator to
 * ignore the badge.
 */
export function AdminNav({ pendingRequests = 0 }: { pendingRequests?: number }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Administration" className="mx-auto max-w-6xl overflow-x-auto px-4">
      <ul className="flex gap-1">
        {TABS.map((tab) => {
          const active =
            tab.href === '/admin' ? pathname === '/admin' : pathname.startsWith(tab.href);
          const badge = tab.href === '/admin/requests' ? pendingRequests : 0;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`focus:outline-accent -mb-px inline-flex min-h-[44px] items-center whitespace-nowrap border-b-[3px] px-3 text-[13.5px] font-semibold focus:outline focus:outline-[3px] focus:outline-offset-[-3px] ${
                  active
                    ? 'border-[#0d4a43] text-[#0d4a43]'
                    : 'border-transparent text-[#5b6b78] hover:text-[#14232e]'
                }`}
              >
                {tab.label}
                {badge > 0 ? (
                  <span
                    // Counted, not decorative: read it out rather than leaving a
                    // screen-reader user with a bare number beside a tab name.
                    aria-label={`${badge} waiting for a decision`}
                    className="ml-1.5 inline-flex min-w-[20px] items-center justify-center rounded-full bg-[#e6eefc] px-1.5 py-0.5 text-[11px] font-bold text-[#243f7a]"
                  >
                    {badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
