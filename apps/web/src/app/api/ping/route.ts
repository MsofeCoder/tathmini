/**
 * The reachability probe's target (see lib/reachability.ts).
 *
 * Deliberately the cheapest thing this app can answer: no session lookup, no
 * database, no body. It exists to prove one thing — that a request from this
 * device reached this origin and came back — which is what `navigator.onLine`
 * cannot tell you on a wifi that routes nowhere.
 *
 * It is under /api because sw.ts routes everything there `NetworkOnly`. A
 * probe answered from a cache would report a healthy network at the exact
 * moment there is none.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return new Response(null, {
    status: 204,
    headers: { 'Cache-Control': 'no-store' },
  });
}
