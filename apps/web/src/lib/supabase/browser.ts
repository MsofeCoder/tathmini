import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The browser Supabase client — restored on 2026-09-06 for Realtime.
 *
 * It was deleted on 2026-09-05 (see MEMORY.md) because nothing used it: every
 * call in the app was server-side, so the `NEXT_PUBLIC_` prefix was inlining
 * two values into the client bundle for no benefit. That reasoning was right
 * then and does not hold now. Keeping the device's copy live means holding a
 * socket open from the browser, and a socket cannot be opened by a server
 * component. The old note said "restore it from git history if a browser
 * client is ever genuinely needed, and give it its own explicitly public env
 * vars" — this is that, with those.
 *
 * Nothing about the security boundary moves. The anon key is public by design
 * and RLS is what decides which rows exist for this caller (AGENTS.md rule 1),
 * including over Realtime: `postgres_changes` re-runs the SELECT policy per
 * subscriber, so a supervisor's socket carries their own route and nothing
 * else. The service-role key remains server-only and is never read here.
 *
 * `createBrowserClient` from `@supabase/ssr` reads the same auth cookie the
 * server client writes, so the socket authenticates as the signed-in
 * supervisor without a second sign-in — and stops carrying their identity the
 * moment they sign out.
 */

let client: SupabaseClient | null = null;

/**
 * Returns the one browser client, or null when the public environment
 * variables are absent.
 *
 * Null rather than a throw: the app has to keep working when Realtime cannot
 * start. A missing variable in a preview deployment must cost a supervisor
 * live updates, not their route list — everything still syncs on open, on
 * reconnect and on focus, which is exactly how the app behaved before this
 * existed.
 */
export function getBrowserClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  client ??= createBrowserClient(url, anonKey);
  return client;
}
