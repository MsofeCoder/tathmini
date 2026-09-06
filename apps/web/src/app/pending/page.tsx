'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The Pending screen became the Pending tab inside `/reports`.
 *
 * Kept as a redirect rather than deleted: the service worker has precached
 * this URL on every phone already running the app, a supervisor may have it
 * open or bookmarked, and a 404 on a screen whose whole purpose is "your work
 * is safe" is the worst possible answer.
 *
 * Redirected on the client, not with `redirect()` from a Server Component: a
 * server redirect is a network round trip, and this is exactly the screen
 * someone reaches with no signal.
 */
export default function PendingPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/reports');
  }, [router]);

  return (
    <main className="min-h-dvh bg-[#eceff0] p-4">
      <p className="text-[13px] text-[#5b6b78]">Pending is now inside Reports. Taking you there…</p>
    </main>
  );
}
