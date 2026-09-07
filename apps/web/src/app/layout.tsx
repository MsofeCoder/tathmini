import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ConnectionWatcher } from '@/components/connection-watcher';
import { SyncProvider } from '@/components/sync-provider';
import { OutboxDrainer } from './outbox-drainer';

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
        {/* All three mounted once, here, so they run on every screen: a
            supervisor must never have to visit a particular page to make
            their data fresh or their marks send. SyncProvider fills the
            device and holds the Realtime socket open; OutboxDrainer empties
            it outward; ConnectionWatcher says which of those is possible
            right now.

            The bottom navigation is NOT here — it lives inside the shell,
            which is the only thing that knows the current path once
            navigation stops being a page load. */}
        <SyncProvider />
        <OutboxDrainer />
        <ConnectionWatcher />
        {children}
      </body>
    </html>
  );
}
