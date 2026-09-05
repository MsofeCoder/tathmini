import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppChrome } from '@/components/app-chrome';
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
        <OutboxDrainer />
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
