import type { ReportTrainee } from './data';

const SLOT_NUMBER: Record<'a1' | 'a2', string> = { a1: '1', a2: '2' };

/**
 * Filesystem- and URL-safe token: strips accents, collapses anything that is
 * not a letter, digit or dash, and trims. Supabase Storage keys tolerate a
 * narrow character set, and a key that needs escaping is a key that breaks
 * quietly somewhere later.
 */
export function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase();
}

export interface ReportFileNameInput {
  traineeId: string;
  slot: 'a1' | 'a2';
  trainee: Pick<ReportTrainee, 'name' | 'registrationNumber' | 'track'>;
  /**
   * Route code, e.g. 'TP ROUTE 3'. Passed in rather than read off
   * ReportTrainee: the route never appears ON the report, it only decides
   * where the file is filed, so it does not belong in the render model.
   */
  routeCode: string | null;
  resultId: string;
  hash: string;
  /** Injected for deterministic tests. */
  now?: Date;
}

export interface ReportFileNames {
  /** Key inside the private `reports` bucket. */
  storagePath: string;
  /** What the supervisor's device saves the file as. */
  downloadName: string;
}

/**
 * Where a generated report is filed, and what it is called.
 *
 * Storage layout: `<ROUTE>/<trainee_id>/<year>/<TRACK>-ASSESSOR<n>-<REG>-<date>-<hash8>.pdf`
 *
 * Route first, so the bucket groups the way the College works — a supervisor
 * owns a route, and the Coordinator reviews by route. The trainee id is the
 * SECOND segment and that is load-bearing: migration 0016's Storage policies
 * scope on it, so reordering these two makes every object unreadable. The year
 * keeps a trainee's folder legible across the 24 months of archives CONTEXT.md
 * requires.
 *
 * A trainee with no route falls back to `UNASSIGNED`. It cannot happen through
 * the app — `trainees.route_id` is NOT NULL — but the path must never collapse
 * to an empty first segment, which would silently shift every later segment up
 * and break the policy's positional read.
 *
 * The trainee's NAME is deliberately not in the storage key. Bucket listings
 * are visible to coordinators and super_admins and turn up in tooling and
 * logs; a registration number identifies the file just as well there. The name
 * belongs in the download filename, which only reaches someone already
 * authorised to open the document.
 *
 * The hash suffix is what makes regeneration safe: reports are append-only
 * like the marks behind them, so a re-run writes a new object instead of
 * overwriting the one already recorded in `reports.sha256_hash`. Identical
 * content produces the identical key, which is why a double-tap collides
 * harmlessly rather than filling the bucket.
 */
export function reportFileNames({
  traineeId,
  slot,
  trainee,
  routeCode,
  resultId,
  hash,
  now = new Date(),
}: ReportFileNameInput): ReportFileNames {
  const year = String(now.getUTCFullYear());
  const iso = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const compact = iso.replace(/-/g, ''); // YYYYMMDD

  // Registration numbers are null for IPT trainees (the register records a
  // phone instead), so fall back to a short slice of the result id — stable
  // for this assessment and meaningless outside it.
  const reference = trainee.registrationNumber
    ? slug(trainee.registrationNumber)
    : `REF-${resultId.slice(0, 8).toUpperCase()}`;

  const assessor = `ASSESSOR${SLOT_NUMBER[slot]}`;
  const track = slug(trainee.track);

  const route = slug(routeCode ?? '') || 'UNASSIGNED';

  const storagePath =
    `${route}/${traineeId}/${year}/` +
    `${track}-${assessor}-${reference}-${compact}-${hash.slice(0, 8)}.pdf`;

  const name = slug(trainee.name) || 'TRAINEE';
  const downloadName = `MVTTC-${track}-Result-${name}-${reference}-Assessor${SLOT_NUMBER[slot]}-${iso}.pdf`;

  return { storagePath, downloadName };
}
