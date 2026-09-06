import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry } from 'serwist';
import { NetworkFirst, NetworkOnly, Serwist } from 'serwist';

/**
 * What makes the app openable with the radio off.
 *
 * Since the local-first rebuild, every screen a supervisor uses renders from
 * IndexedDB and needs no server data. What it still needs is its own HTML
 * document, and that is this file's job: keep each app screen in the cache
 * AT ITS OWN URL, so a navigation offline is answered with the document that
 * url would have returned anyway.
 *
 * That last clause is the fix for the crash this app used to throw. The
 * previous design answered any failed navigation with the `/offline` page's
 * document, so App Router received a payload built for /offline while the
 * address bar said /trainee/<id>, refused to reconcile them, and rendered
 * "Application error: a client-side exception has occurred". Supervisors hit
 * it whenever they tapped a trainee on a connection that was up but not
 * working — `navigator.onLine` true, requests failing — which is an ordinary
 * afternoon on a College route.
 *
 * Deliberately NOT caching Supabase API responses or any per-user data:
 * those are RLS-scoped and often personal, and an opaque HTTP cache on a
 * shared device is the wrong place for them. The pages cached here carry no
 * data at all — they are empty shells that fill themselves from IndexedDB,
 * which is what makes caching them safe.
 *
 * `self` is typed inline rather than via `declare const self:
 * ServiceWorkerGlobalScope`, which would need the WebWorker lib — and adding
 * that to this app's tsconfig collides with the DOM lib every other file
 * depends on. This file is bundled by Serwist's own worker pass, so only the
 * manifest global actually needs describing here.
 */
const swSelf = self as unknown as {
  __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
};

/**
 * A navigable app screen → the key its document is cached under.
 *
 * Every trainee shares one entry, and every marking screen shares another,
 * because the server serves them one static document each (next.config.ts
 * rewrites `/trainee/:id` onto `/trainee`). So caching the document fetched
 * for one trainee and replaying it for another is not a substitution — it is
 * the same bytes the server would have sent.
 */
function shellKey(pathname: string): string | null {
  if (pathname === '/home' || pathname === '/pending' || pathname === '/account') {
    return pathname;
  }
  // /trainee/<id>/mark/<code> — checked first, since it also starts /trainee/
  if (/^\/trainee\/[^/]+\/mark\/[^/]+\/?$/.test(pathname)) return '/__shell/mark';
  if (/^\/trainee\/[^/]+\/?$/.test(pathname)) return '/__shell/trainee';
  // The rewrite targets, in case anything navigates to them directly.
  if (pathname === '/mark') return '/__shell/mark';
  if (pathname === '/trainee') return '/__shell/trainee';
  return null;
}

const serwist = new Serwist({
  precacheEntries: swSelf.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    /**
     * Anything that changes state goes straight to the network, before any
     * caching rule gets a chance at it.
     *
     * `defaultCache` matches `/api/*`, and that quietly broke report sending:
     * the drainer's POST never left the device. A GET on the POST-only report
     * route returned 200 from the service worker where the server would have
     * said 405 — proof the request was being answered locally — and the POST
     * itself came back 405, because a cache cannot serve one.
     *
     * Every non-GET is excluded too, not just /api. A Server Action is a POST
     * to a page URL, so a rule written only for /api would leave the same hole
     * one route over. `/api/sync` and `/api/ping` depend on this as well: a
     * sync served from a cache would write yesterday's route over today's,
     * and a cached probe would report a healthy network at the exact moment
     * there is none.
     */
    {
      matcher: ({ url, request }: { url: URL; request: Request }) =>
        url.pathname.startsWith('/api/') || request.method !== 'GET',
      handler: new NetworkOnly(),
    },

    /**
     * The app's own screens.
     *
     * NetworkFirst, not CacheFirst: online, a supervisor must get the shell
     * from the deploy that is actually live, or a released fix would never
     * reach a phone that already has the old one. The three-second timeout is
     * what makes that safe in the field — a connection that has associated
     * but is passing nothing falls through to the cached copy in three
     * seconds rather than hanging on a spinner, which is how "online but
     * useless" used to feel like a broken app.
     */
    {
      matcher: ({ request, url }: { request: Request; url: URL }) =>
        request.mode === 'navigate' && shellKey(url.pathname) !== null,
      handler: new NetworkFirst({
        cacheName: 'tathmini-app-shell',
        networkTimeoutSeconds: 3,
        plugins: [
          {
            // Collapse every trainee onto one entry, and drop the query
            // string — `?id=` selects which trainee to render FROM THE
            // DEVICE; it does not change the document.
            cacheKeyWillBeUsed: async ({ request }: { request: Request }) => {
              const key = shellKey(new URL(request.url).pathname);
              return new URL(key ?? new URL(request.url).pathname, self.location.origin).toString();
            },
          },
        ],
      }),
    },

    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        // Only reached for a navigation this worker has never cached — a
        // screen the supervisor has not opened since installing, or a url
        // that is not one of ours. A plain file, so there is no React payload
        // to mismatch against the address bar.
        url: '/offline.html',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
});

serwist.addEventListeners();
