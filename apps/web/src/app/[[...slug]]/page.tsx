import { AppShell } from '@/components/app-shell';

/**
 * The one route the field app has.
 *
 * An optional catch-all, so a single built document answers `/`, `/home`,
 * `/reports`, `/account`, `/trainee/<id>` and `/trainee/<id>/mark/<code>`
 * (plus `/pending`, the old url the Reports screen still answers).
 * More specific routes still win — `/login`, `/change-password`, everything
 * under `/api`, and the report preview are real server routes and are not
 * matched here.
 *
 * It renders nothing route-specific on the server. That is deliberate and
 * load-bearing: the service worker precaches this page once and replays it
 * for every url, so the prerendered html has to be valid at all of them.
 * AppShell reads the path on the client and picks the screen from there.
 */
export default function CatchAllPage() {
  return <AppShell />;
}

/**
 * Prerender the shell as a static file.
 *
 * `/` is the one that matters: it is what the service worker precaches and
 * replays for every navigation, so it should be a file on a CDN rather than a
 * serverless invocation on every cold start. The others are listed because
 * they cost nothing — the same bytes — and it means a first online visit to
 * any tab is static too. `/pending` stays on the list: phones in the field
 * have that url precached and bookmarked, and it still serves Reports.
 *
 * Trainee paths are deliberately absent. There is no build-time list of
 * trainees, and none is needed: the worker never asks the server for those
 * urls, and a first online visit renders this same shell on demand.
 */
export function generateStaticParams() {
  return [
    { slug: [] },
    { slug: ['home'] },
    { slug: ['reports'] },
    { slug: ['pending'] },
    { slug: ['account'] },
  ];
}
