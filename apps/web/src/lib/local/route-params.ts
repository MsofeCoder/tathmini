/**
 * Reading the trainee and instrument out of the url the supervisor is on.
 *
 * This exists because of a bug that made every trainee unopenable, for
 * everyone, in the first local-first build. The screens are static pages
 * reached through a rewrite — `/trainee/<id>` serves `/trainee?id=<id>` — and
 * the pages read the id with `useSearchParams()`. But a rewrite is resolved on
 * the SERVER: the browser's address bar still reads `/trainee/<id>`, with no
 * query string at all, and a statically prerendered page has no server render
 * to inject one. So the id came back empty, the profile found no trainee, and
 * the screen said "not on your route" about a trainee who was sitting in the
 * route list one tap earlier.
 *
 * The path is the thing the browser actually has, so the path is what these
 * read. The query string stays as a fallback for a direct visit to the rewrite
 * target (`/trainee?id=…`), which is what a link built from the destination
 * rather than the source would produce.
 *
 * Pure and tested: the parse is the difference between the app working and
 * every trainee reporting "not found", and it is not something to leave to a
 * regex read once in a component.
 */

/** `/trainee/<id>` → the id. Also tolerates a trailing slash. */
export function traineeIdFromPath(pathname: string): string | null {
  const match = /^\/trainee\/([^/]+)\/?$/.exec(pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export interface MarkTarget {
  traineeId: string;
  instrumentCode: string;
}

/** `/trainee/<id>/mark/<code>` → both halves. */
export function markTargetFromPath(pathname: string): MarkTarget | null {
  const match = /^\/trainee\/([^/]+)\/mark\/([^/]+)\/?$/.exec(pathname);
  if (!match?.[1] || !match[2]) return null;
  return {
    traineeId: decodeURIComponent(match[1]),
    instrumentCode: decodeURIComponent(match[2]),
  };
}

/**
 * The id for the profile screen, from wherever it is actually available.
 *
 * `search` is whatever `useSearchParams()` gives, which on the real url is
 * empty — hence the order.
 */
export function resolveTraineeId(pathname: string, search: URLSearchParams | null): string {
  return traineeIdFromPath(pathname) ?? search?.get('id') ?? '';
}

/** The same, for the marking screen. */
export function resolveMarkTarget(pathname: string, search: URLSearchParams | null): MarkTarget {
  const fromPath = markTargetFromPath(pathname);
  if (fromPath) return fromPath;
  return {
    traineeId: search?.get('trainee') ?? '',
    instrumentCode: search?.get('instrument') ?? '',
  };
}
