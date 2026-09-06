import { db, type ReportDraftRecord } from './db';

/**
 * "I have finished this report, but I am not sending it yet."
 *
 * Before this existed, submitting a report was a single irreversible tap taken
 * the moment marking ended — often standing in a workshop, with the trainee
 * beside them. A supervisor who wanted to re-read it, check a name, or wait
 * until the second assessor had been had only two options: send it anyway, or
 * remember to come back to a screen with nothing on it to say so.
 *
 * A draft holds no document, on purpose. Nothing is rendered until the
 * supervisor sends, so the date printed on the report is the date they
 * actually submitted it — see renderReportHtml's `submittedAt`. Saving a
 * pre-rendered PDF would freeze the wrong date into it the moment the draft
 * was left overnight.
 *
 * Kept on the device, like marks in progress and the outbox: holding a report
 * back is the supervisor's own decision, and it has to work with no signal,
 * which is exactly when it gets made.
 */

export interface SaveReportDraftInput {
  traineeId: string;
  traineeName: string;
  note?: string;
}

export async function saveReportDraft({
  traineeId,
  traineeName,
  note,
}: SaveReportDraftInput): Promise<void> {
  await db.reportDrafts.put({
    key: traineeId,
    traineeName,
    savedAt: Date.now(),
    // An empty box means "no note", not an empty note.
    ...(note?.trim() ? { note: note.trim() } : {}),
  });
}

export async function getReportDraft(traineeId: string): Promise<ReportDraftRecord | undefined> {
  return db.reportDrafts.get(traineeId);
}

export async function listReportDrafts(): Promise<ReportDraftRecord[]> {
  return db.reportDrafts.toArray();
}

/**
 * Called when a held report is finally sent, and when the supervisor discards
 * the draft. Deleting a draft that is not there is not an error — the send
 * path calls this unconditionally rather than checking first.
 */
export async function removeReportDraft(traineeId: string): Promise<void> {
  await db.reportDrafts.delete(traineeId);
}

export async function traineeIdsWithReportDrafts(): Promise<Set<string>> {
  const drafts = await db.reportDrafts.toArray();
  return new Set(drafts.map((draft) => draft.key));
}

/**
 * Oldest first: a report held back for a week is the one most likely to have
 * been forgotten, so it belongs at the top of the list a supervisor checks.
 */
export function sortDraftsByAge(drafts: readonly ReportDraftRecord[]): ReportDraftRecord[] {
  return [...drafts].sort((a, b) => a.savedAt - b.savedAt);
}

/**
 * How long a report has been sitting unsent, in the plainest words available.
 *
 * Deliberately vague past a day — "3 days ago" is what a supervisor needs, and
 * a precise timestamp on a queue invites reading it as a deadline.
 */
export function describeAge(savedAt: number, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - savedAt) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
