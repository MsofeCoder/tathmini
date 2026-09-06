import { NextResponse, type NextRequest } from 'next/server';

/**
 * The gate, and nothing more.
 *
 * This used to call `supabase.auth.getUser()` on EVERY request — a network
 * round trip to the Auth server, completing before the page began its own
 * queries. Two things were wrong with that:
 *
 * 1. **It was the single largest source of latency in the app.** Measured
 *    against production: `/login` 527 ms TTFB, `/home` 713 ms, against 276 ms
 *    for a static file that skips middleware. Roughly 440 ms of every
 *    navigation was this call, before the supervisor's own 3G hop.
 * 2. **It made the app unopenable offline by construction.** Every screen sat
 *    behind a check that itself required the network, so no amount of caching
 *    downstream could produce a page. That is what the local-first rebuild
 *    had to remove, not work around.
 *
 * What replaces it is a cookie-presence check, which costs nothing and works
 * with the radio off. It is a courtesy gate — it sends somebody with no
 * session to the sign-in screen instead of a blank app — and it is honest
 * about being one: a forged or expired cookie gets past it and then reads
 * NOTHING, because every read is an RLS-scoped query made with that cookie,
 * and `/api/sync` answers 401 to anything it cannot authenticate. The
 * boundary is in Postgres, where AGENTS.md rule 1 says it belongs; it was
 * never here.
 *
 * The session cookie is still refreshed — by `/api/sync` and the Server
 * Actions, which use the `@supabase/ssr` server client and write cookies as
 * they go. The app calls sync on open, on focus and on reconnect, so a phone
 * that is used at all keeps a fresh session.
 */

// /offline.html is a static file that renders no user data and exists to be
// shown when the network is gone — gating it would make the offline fallback
// require the very thing it exists to work without.
//
// "/" is the install-prompt splash (reference/Tathmini.dc.html's `install`
// screen) — it has to render before sign-in, for exactly the signed-out
// first-time visitor the install prompt targets. Matched by exact equality
// below, never startsWith: every path starts with "/", so a prefix match
// here would make the whole app public.
const PUBLIC_PATHS = ['/login', '/offline.html'];
const PUBLIC_EXACT_PATHS = ['/'];

/**
 * Supabase's auth cookie is named `sb-<project-ref>-auth-token`, and is
 * chunked into `.0`, `.1` … when it exceeds the browser's per-cookie limit.
 * Matching on the shape rather than a hardcoded name keeps this working
 * across projects and across chunking.
 */
function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith('sb-') && cookie.name.includes('auth-token'));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublicPath =
    PUBLIC_EXACT_PATHS.includes(pathname) || PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  if (!isPublicPath && !hasSessionCookie(request)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request });
}

export const config = {
  // sw.js and Serwist's worker chunks MUST be excluded: this middleware
  // redirects anything unauthenticated to /login, and a service worker
  // script served as a redirect fails registration outright (the spec
  // disallows it), which would silently disable offline support entirely.
  //
  // manifest.webmanifest needs the same treatment: a signed-out visitor is
  // exactly who the install prompt targets, and a browser that fetches the
  // manifest and gets a redirect body instead of JSON silently drops the
  // install prompt rather than erroring loudly.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|swe-worker-.*\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
