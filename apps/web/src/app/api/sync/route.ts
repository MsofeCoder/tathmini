import { createClient } from '@/lib/supabase/server';
import { collectSyncPayload } from '@/lib/sync/collect';

/**
 * The one endpoint that fills the device.
 *
 * A route handler rather than a Server Action because it is called from the
 * root layout on every app start, including cold ones where React has not
 * hydrated a page yet, and because the service worker must be able to see it
 * as an ordinary request it is told never to cache (see sw.ts: everything
 * under /api goes NetworkOnly). It is a GET so a caller can retry it freely —
 * it changes nothing.
 *
 * 401 rather than a redirect: the caller is the sync loop, not a browser
 * following links, and it has to be able to tell "your session has expired,
 * send the supervisor to sign in" apart from "the network is down, keep the
 * data you have". A redirect to /login would be a 200 with an HTML body and
 * would read as neither.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const payload = await collectSyncPayload(supabase, user.id);
  if (!payload) {
    // Authenticated against auth.users but with no row in public.users — the
    // same state the old screens treated as "not really signed in".
    return Response.json({ error: 'unauthenticated' }, { status: 401 });
  }

  return Response.json(payload, {
    // This is one supervisor's route, including trainees' contact details.
    // No shared cache, no browser cache, no service worker: the device's own
    // copy lives in IndexedDB, which the app manages deliberately.
    headers: { 'Cache-Control': 'no-store, private' },
  });
}
