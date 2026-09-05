import withSerwistInit from '@serwist/next';
import type { NextConfig } from 'next';

// Disabled in dev so the service worker can never serve stale chunks while
// working on the app; it is built and registered for production only.
const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  // The offline entry point must be in the precache even if the supervisor
  // never happened to open it while online. Next's own hashed assets are
  // not precached here by design — they are immutable, so Serwist's default
  // runtime caching serves them cache-first once fetched (the route list
  // prefetches /offline to make sure they have been).
  additionalPrecacheEntries: [{ url: '/offline', revision: null }],
  // Serwist reloads the page when connectivity returns by default. In the
  // field, signal flaps in and out constantly — reloading a supervisor
  // mid-assessment is unacceptable, and nothing needs it: OutboxDrainer
  // already syncs on the same `online` event and refreshes only when
  // something actually sent.
  reloadOnOnline: false,
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Report generation launches headless Chromium, and neither of these can be
  // bundled. @sparticuz/chromium ships a Brotli-compressed Chromium binary in
  // its own bin/ and resolves that path at runtime; webpack relocates the JS
  // and leaves the binary behind, so on Vercel it threw
  //   The input directory ".../@sparticuz/chromium/bin" does not exist.
  // and every "Submit report" returned a 500. playwright-core is listed for
  // the same reason — it resolves browser paths and does dynamic requires.
  //
  // This is exactly what the package's own docs mean by "you must externalize
  // @sparticuz/chromium"; serverExternalPackages is Next's way of saying it.
  serverExternalPackages: ['@sparticuz/chromium', 'playwright-core'],
};

export default withSerwist(nextConfig);
