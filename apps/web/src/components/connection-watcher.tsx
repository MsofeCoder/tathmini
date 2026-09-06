'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { isProtectedFromRedirect } from '@/lib/navigation';

/**
 * Switches the app between its online and offline screens on its own, so a
 * supervisor never has to know which mode they are in — the prototype's
 * manual Online/Offline toggle is gone.
 *
 * Every screen except /offline and the marking form is server-rendered
 * against Supabase, and middleware.ts validates the session over the network,
 * so those pages simply cannot be produced with no signal. Rather than let a
 * supervisor tap into a failed navigation and see the service worker's
 * fallback, this moves them to /offline the moment the connection drops.
 *
 * TWO PLACES IT DELIBERATELY DOES NOTHING:
 *
 * 1. While marking. The marking form is client-rendered and keeps working
 *    with no signal, drafts and all. Navigating away from it mid-assessment
 *    to "helpfully" show the offline screen would throw away what is on
 *    screen and is exactly the interruption `reloadOnOnline: false` was
 *    disabled to prevent (see next.config.ts). Signal flaps constantly in the
 *    field; a supervisor must be able to finish the trainee in front of them.
 *
 * 2. On the sign-in screens. A supervisor with no signal cannot sign in
 *    anyway, and bouncing them to /offline would hide the reason.
 *
 * navigator.onLine only reports whether the device has a network interface,
 * not whether Supabase is reachable — it says "online" on a hotel wifi that
 * routes nowhere. It is a good enough trigger for switching screens because
 * the outbox is what actually guarantees delivery: a submission that fails
 * despite navigator.onLine stays queued and is retried.
 */

export function ConnectionWatcher() {
  const router = useRouter();
  const pathname = usePathname();
  // Assume online until the browser says otherwise: rendering an offline
  // banner for a split second on every cold load would train supervisors to
  // ignore it.
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  useEffect(() => {
    if (online) {
      // Back on the network: leave /offline for the real route list, but only
      // from the list itself — the offline screen's own marking flow is
      // client-side state this must not interrupt.
      if (pathname === '/offline') router.replace('/home');
      return;
    }
    if (!isProtectedFromRedirect(pathname)) router.replace('/offline');
  }, [online, pathname, router]);

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 bg-[#6b4400] px-4 py-1.5 text-center text-[12px] font-bold tracking-[0.4px] text-white"
    >
      NO SIGNAL — your work is saved on this phone
    </div>
  );
}
