import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry } from 'serwist';
import { Serwist } from 'serwist';

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
  runtimeCaching: defaultCache,
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
