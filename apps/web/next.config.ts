import path from 'node:path';
import withSerwistInit from '@serwist/next';
import type { NextConfig } from 'next';

// Disabled in dev so the service worker can never serve stale chunks while
// working on the app; it is built and registered for production only.
const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  // The last-resort offline document. A PLAIN HTML FILE in public/, not a
  // Next page, and that is the whole fix for the "Application error" this
  // app used to throw offline.
  //
  // The old fallback was the Next-rendered `/offline` page. A service worker
  // fallback answers a navigation to some OTHER url — /trainee/<id>, say —
  // with this document, and App Router then tried to hydrate a payload built
  // for /offline against a browser url of /trainee/<id>, mismatched, and
  // threw a client-side exception. A file with no React in it cannot
  // mismatch, because there is nothing to hydrate.
  //
  // In practice it is now rarely reached: the app's own screens are cached at
  // their own urls (see sw.ts), so they answer for themselves.
  additionalPrecacheEntries: [{ url: '/offline.html', revision: 'v1' }],
  // Serwist reloads the page when connectivity returns by default. In the
  // field, signal flaps in and out constantly — reloading a supervisor
  // mid-assessment is unacceptable, and nothing needs it: OutboxDrainer
  // already syncs on the same `online` event and refreshes only when
  // something actually sent.
  reloadOnOnline: false,
});

const nextConfig: NextConfig = {
  reactStrictMode: true,

  /**
   * The urls stay exactly as they were; only what serves them changed.
   *
   * `/trainee/<id>` and `/trainee/<id>/mark/<code>` are what the route list
   * links to, what supervisors have bookmarked, and what the prototype
   * describes. But a dynamic segment cannot be prerendered — Next would need
   * one built document per trainee, and offline there is no server to make
   * the missing one. So each maps onto a single STATIC page that reads the id
   * from its query string.
   *
   * That is what makes the service worker able to answer for any trainee from
   * one cached document, and it is the same document the server itself would
   * return for that url — so nothing is being substituted, which is exactly
   * the property the old `/offline` fallback lacked.
   *
   * `afterFiles` so real file routes win: `/trainee/<id>/report/preview` is a
   * route handler and must keep reaching the server.
   */
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [
        {
          source: '/trainee/:id/mark/:instrument',
          destination: '/mark?trainee=:id&instrument=:instrument',
        },
        { source: '/trainee/:id', destination: '/trainee?id=:id' },
      ],
      fallback: [],
    };
  },

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
  // nodemailer is here for a related reason: it is CommonJS, resolves
  // transports by dynamic require, and must never be pulled toward a client
  // bundle -- it reaches for net/tls/dns and it is handed SMTP_PASSWORD.
  serverExternalPackages: ['@sparticuz/chromium', 'playwright-core', 'nodemailer'],

  // This is a pnpm workspace and Vercel's Root Directory is apps/web, but the
  // dependencies are hoisted to the repo root. Without this, tracing is
  // anchored at apps/web and will not carry files from ../../node_modules
  // into the function.
  outputFileTracingRoot: path.join(process.cwd(), '../..'),

  // Externalizing the package was necessary but not sufficient. The tracer
  // follows `require`/`import`, so it found the package's build/*.js and
  // stopped there — bin/ is read from disk at runtime, never imported, so
  // nothing pointed at it and it was left out of the deployment. That is
  // exactly the reported error: the JS shipped, then looked for a Chromium
  // that was never deployed. This forces the payload in — chromium.br plus
  // the swiftshader, fonts and al2023 archives it unpacks alongside.
  //
  // The key follows the ONE route that still launches Chromium. It used to be
  // '/trainee/[id]', because that page hosted the Server Action; that page is
  // now a static shell with no server work in it at all, and the report is
  // generated only by this route handler. A stale key here does not fail the
  // build — it silently ships a function without its browser, which is how
  // this broke the first time.
  outputFileTracingIncludes: {
    '/api/reports/[traineeId]': [
      '../../node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/bin/**',
    ],
  },
};

export default withSerwist(nextConfig);
