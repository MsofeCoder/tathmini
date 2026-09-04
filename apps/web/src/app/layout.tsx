import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tathmini',
  description: 'Digital assessment sheet for Morogoro Vocational Teachers’ Training College',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
