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
 * Storage layout: `<trainee_id>/<year>/<TRACK>-ASSESSOR<n>-<REG>-<date>-<hash8>.pdf`
 *
 * The first segment MUST remain the trainee id: migration 0014's Storage
 * policies scope on `(storage.foldername(name))[1]::uuid`, so putting the year
 * or the track first would make every object unreadable — or worse, throw on
 * the uuid cast. The year subfolder is what keeps a trainee's folder legible
 * across the 24 months of archives CONTEXT.md requires.
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

  const storagePath =
    `${traineeId}/${year}/` +
    `${track}-${assessor}-${reference}-${compact}-${hash.slice(0, 8)}.pdf`;

  const name = slug(trainee.name) || 'TRAINEE';
  const downloadName = `MVTTC-${track}-Result-${name}-${reference}-Assessor${SLOT_NUMBER[slot]}-${iso}.pdf`;

  return { storagePath, downloadName };
}
