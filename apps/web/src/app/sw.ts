import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry } from 'serwist';
import { NetworkOnly, Serwist } from 'serwist';

/**
 * What makes the app work with the radio off — in one rule.
 *
 * Every screen a supervisor uses renders from IndexedDB and needs no server
 * data. What it still needs is an html document, and that is what this
 * provides: ONE precached shell, replayed for every navigation.
 *
 * The previous design cached a document per url, and all three offline
 * failures this project has had were that decision failing in different
 * ways — a fallback document served at another route's url, which App Router
 * refused to hydrate; a rewrite that hid the trainee id from the browser; and
 * a cache that only ever held the screens somebody had already opened online,
 * so anything else fell through to a "this screen needs a connection" page.
 *
 * With one shell there is nothing to enumerate, nothing to warm and nothing
 * to forget. If the worker installed, every screen works — including screens
 * added in a later release and trainees added this morning.
 *
 * Deliberately NOT caching Supabase responses or any per-user data: those are
 * RLS-scoped and often personal, and an opaque http cache on a shared device
 * is the wrong place for them. The shell carries no data at all, which is
 * what makes caching it safe.
 *
 * `self` is typed inline rather than via `declare const self:
 * ServiceWorkerGlobalScope`, which would need the WebWorker lib — and adding
 * that to this app's tsconfig collides with the DOM lib every other file
 * depends on.
 */
const swSelf = self as unknown as {
  __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
};

/** The precached document that answers every in-app navigation. `/` is the
 * catch-all route (app/[[...slug]]/page.tsx), prerendered at build. */
const SHELL_URL = '/';

/**
 * Paths that genuinely need the server and must never be answered with the
 * shell: signing in, the api, and the report preview, which is rendered
 * server-side by the same code that prints the PDF. They fail honestly with
 * no connection rather than showing a shell that cannot do the job.
 */
const SERVER_ONLY = [
  /^\/api\//,
  /^\/login/,
  /^\/change-password/,
  /^\/trainee\/[^/]+\/report\//,
  // The administration console is server-rendered on purpose: it reads the
  // whole cohort, exports and the audit log, none of which belong in a device
  // replica, and it is used at a desk on wifi. Answering it with the shell
  // would render "Screen not found" over a console that works perfectly.
  /^\/admin/,
  /^\/_next\//,
];

function isShellNavigation(request: Request, url: URL): boolean {
  if (request.mode !== 'navigate') return false;
  return !SERVER_ONLY.some((pattern) => pattern.test(url.pathname));
}

/**
 * The shell handler below closes over this before it is assigned. That is
 * safe, and deliberate: the closure only runs at fetch time, long after
 * construction returns. The indirection exists because the handler needs to
 * read the instance's own precache, and the instance needs the handler.
 */
const serwist: Serwist = new Serwist({
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
     * to a page url, so a rule written only for /api would leave the same
     * hole one route over. `/api/sync` and `/api/ping` depend on this as
     * well: a sync served from cache would write yesterday's route over
     * today's, and a cached probe would report a healthy network at the exact
     * moment there is none.
     */
    {
      matcher: ({ url, request }: { url: URL; request: Request }) =>
        url.pathname.startsWith('/api/') || request.method !== 'GET',
      handler: new NetworkOnly(),
    },

    /**
     * Every in-app navigation, answered from the precached shell.
     *
     * ORDER IS LOAD-BEARING: this must sit ahead of `defaultCache`, which
     * carries its own navigation and RSC rules for an ordinary
     * server-rendered Next app. Serwist tries routes in registration order,
     * so registering this afterwards — with `serwist.registerRoute` — would
     * mean `defaultCache` claimed the navigation first, went to the network,
     * missed its cache offline, and left the browser on its own error page.
     * The whole offline story would be dead, silently, on a line of code
     * that looked equivalent.
     *
     * Cache first, network never: the shell is a static document with no data
     * in it, so there is nothing to be stale about, and going to the network
     * would put a doomed request in front of every screen change in a dead
     * zone. A new build reaches the device through the precache revision
     * (next.config.ts), which is what that mechanism is for.
     */
    {
      matcher: ({ request, url }: { request: Request; url: URL }) =>
        isShellNavigation(request, url),
      handler: async ({ request }: { request: Request }) =>
        (await serwist.matchPrecache(SHELL_URL)) ?? fetch(request),
    },

    ...defaultCache,
  ],
});

serwist.addEventListeners();
