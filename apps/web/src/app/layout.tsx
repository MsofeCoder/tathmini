import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppChrome } from '@/components/app-chrome';
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
        {/* Both mounted once, here, so they run on every screen: a supervisor
            must never have to visit a particular page to make their data
            fresh or their marks send. SyncProvider fills the device and holds
            the Realtime socket open; OutboxDrainer empties it outward. */}
        <SyncProvider />
        <OutboxDrainer />
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
