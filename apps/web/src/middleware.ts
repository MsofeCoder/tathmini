import { NextResponse, type NextRequest } from 'next/server';

/**
 * Guards the API. Nothing else.
 *
 * Two rounds of simplification got it here, and both were forced by the
 * field:
 *
 * 1. It used to call `supabase.auth.getUser()` on EVERY request — a network
 *    round trip to the Auth server before the page began its own queries.
 *    Measured against production: `/login` 527 ms TTFB, `/home` 713 ms,
 *    against 276 ms for a static file that skips middleware. Roughly 440 ms
 *    of every navigation was this call, before the supervisor's own 3G hop.
 *    Worse, it made the app unopenable offline by construction: every screen
 *    sat behind a check that itself required the network.
 * 2. It then gated page navigations on a session cookie. That is pointless
 *    now. The app is one shell document containing NO data — the screens fill
 *    themselves from IndexedDB, and IndexedDB is filled by `/api/sync`, which
 *    authenticates properly. Gating the shell only produced redirects: to
 *    `/login` for a supervisor whose cookie had lapsed while their marks sat
 *    unsent on the device, and, worst of all, for `/api/sync` itself, whose
 *    caller reads a redirect as "the network failed" and gives up silently.
 *
 * So: an unauthenticated request for a screen gets the shell, which finds no
 * session on the device, asks `/api/sync`, is told 401, and sends the person
 * to sign in. One place decides that, on the client, where it also works with
 * no signal.
 *
 * The boundary was never here. Every read is an RLS-scoped query made with
 * the caller's own session (AGENTS.md rule 1); a forged cookie gets past this
 * file and then reads nothing.
 */

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

/** `/api/ping` is the reachability probe and must answer without a session —
 * its whole job is to prove the round trip completed. */
const PUBLIC_API_PATHS = ['/api/ping'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // A status code, never a redirect. The sync fetches with `redirect:
  // 'error'`, so a redirect THROWS, and a throw is read as "the network
  // failed" — the one outcome that deliberately changes nothing and says
  // nothing. That left supervisors whose session had lapsed on an empty route
  // list with no error, no prompt to sign in and nothing to press.
  if (
    pathname.startsWith('/api/') &&
    !PUBLIC_API_PATHS.includes(pathname) &&
    !hasSessionCookie(request)
  ) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 });
  }

  return NextResponse.next({ request });
}

export const config = {
  // Only the API needs to reach this now, but the matcher still excludes the
  // worker scripts and the manifest explicitly. Both have bitten this project
  // before: a service worker script served as a redirect fails registration
  // outright, and a manifest that returns anything but json makes the browser
  // silently drop the install prompt.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|swe-worker-.*\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
