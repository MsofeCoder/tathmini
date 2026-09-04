import type { Metadata } from 'next';
import './globals.css';
import { OutboxDrainer } from './outbox-drainer';

export const metadata: Metadata = {
  title: 'Tathmini',
  description: 'Digital assessment sheet for Morogoro Vocational Teachers’ Training College',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <OutboxDrainer />
        {children}
      </body>
    </html>
  );
}
