import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// /offline renders entirely from the device's own IndexedDB and carries no
// server data, so it must stay reachable without a session check — the
// service worker serves it precisely when the network (and therefore the
// auth check itself) is unavailable. Gating it would make the offline
// entry point require the very thing it exists to work without.
//
// "/" is the install-prompt splash (reference/Tathmini.dc.html's `install`
// screen) — it has to render before sign-in, for exactly the signed-out
// first-time visitor the install prompt targets. Matched by exact equality
// below, never startsWith: every path starts with "/", so a prefix match
// here would make the whole app public.
const PUBLIC_PATHS = ['/login', '/offline'];
const PUBLIC_EXACT_PATHS = ['/'];

/**
 * Refreshes the Supabase session cookie on every request (required by
 * @supabase/ssr — a Server Component alone can't write cookies) and
 * gates unauthenticated access to everything except /login.
 *
 * Deliberately does NOT check users.must_change_password here — that's
 * a per-account data lookup, not something to embed in every request's
 * middleware; the /home and /change-password pages themselves enforce
 * it (see their layout logic).
 */
export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        supabaseResponse = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublicPath =
    PUBLIC_EXACT_PATHS.includes(request.nextUrl.pathname) ||
    PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
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
