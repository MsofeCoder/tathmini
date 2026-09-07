import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ConnectionWatcher } from '@/components/connection-watcher';
import { SyncProvider } from '@/components/sync-provider';

export const metadata: Metadata = {
  title: 'Tathmini',
  description: 'Digital assessment sheet for Morogoro Vocational Teachers’ Training College',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Tathmini',
  },
};

export const viewport: Viewport = {
  themeColor: '#0d4a43',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Both mounted once, here, so they run on every screen: a supervisor
            must never have to visit a particular page to make their data
            fresh. SyncProvider fills the device and holds the Realtime socket
            open; ConnectionWatcher says whether anything can leave the phone
            right now.

            OutboxDrainer used to sit between them, replaying queued marks and
            reports whenever signal returned. It is deliberately gone: nothing
            is sent that a supervisor did not press a button for. The same pass
            now runs from the Send control on the Reports screen — see
            lib/send-pending.ts, which also records what that costs.

            The bottom navigation is NOT here — it lives inside the shell,
            which is the only thing that knows the current path once
            navigation stops being a page load. */}
        <SyncProvider />
        <ConnectionWatcher />
        {children}
      </body>
    </html>
  );
}
