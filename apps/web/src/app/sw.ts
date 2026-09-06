import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry } from 'serwist';
import { NetworkOnly, Serwist } from 'serwist';

/**
 * What makes marking possible with the radio off.
 *
 * Every screen except /offline and /login is server-rendered against
 * Supabase, and middleware.ts validates the session over the network on
 * every request — so with no connection the device cannot produce them at
 * all. Precaching the build's own assets here, and falling back to the
 * statically prerendered /offline page whenever a navigation fails, is what
 * lets a supervisor open the app cold in a dead zone and keep working from
 * the route snapshot in IndexedDB.
 *
 * Deliberately NOT caching Supabase API responses or any server-rendered
 * HTML: those are per-user, RLS-scoped and often personal data, and an
 * opaque HTTP cache on a shared device is the wrong place for them.
 * Offline data comes from IndexedDB, which the app writes deliberately.
 *
 * `self` is typed inline rather than via `declare const self:
 * ServiceWorkerGlobalScope`, which would need the WebWorker lib — and
 * adding that to this app's tsconfig collides with the DOM lib every other
 * file depends on. This file is bundled by Serwist's own worker pass, so
 * only the manifest global actually needs describing here.
 */
const swSelf = self as unknown as {
  __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
};

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
     * one route over. Nothing that mutates data should ever be answered from a
     * cache, and offline data in this app comes from IndexedDB deliberately —
     * never from an opaque HTTP cache on a shared device.
     */
    {
      matcher: ({ url, request }: { url: URL; request: Request }) =>
        url.pathname.startsWith('/api/') || request.method !== 'GET',
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
});

serwist.addEventListeners();
