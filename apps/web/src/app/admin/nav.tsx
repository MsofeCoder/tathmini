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
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Administration" className="mx-auto max-w-6xl overflow-x-auto px-4">
      <ul className="flex gap-1">
        {TABS.map((tab) => {
          const active =
            tab.href === '/admin' ? pathname === '/admin' : pathname.startsWith(tab.href);
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
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
