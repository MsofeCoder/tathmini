import { db } from './db';
import type { MarksByCriterion } from './marking';

/**
 * Local draft persistence, scoped per (trainee, instrument). HANDOFF.md's
 * agreed offline-first cut: every criterion score/comment saves here as the
 * supervisor works, so reopening a trainee — even after a crash or a flat
 * battery — restores what they typed. A draft is cleared only once its
 * submission is confirmed accepted by the server, never merely because it
 * was queued (see outbox.ts).
 */

/** Everything a supervisor has typed for one instrument: the scores, the
 * per-criterion comments (TP), and the general comment. */
export interface DraftState {
  marks: MarksByCriterion;
  /** Keyed by `criteria.section_code`. */
  sectionComments: Record<string, string>;
  generalComment: string;
  /**
   * The day the assessment was carried out, `YYYY-MM-DD`. Held in the draft so
   * a supervisor who sets it on Monday and submits on Wednesday still submits
   * Monday — the whole point of the field would be lost if it reset when the
   * app was reopened.
   */
  assessedOn: string | null;
}

export function draftKey(traineeId: string, instrumentId: string): string {
  return `${traineeId}:${instrumentId}`;
}

/**
 * Reads a draft, tolerating the pre-2026-09-05 shape that stored `marks`
 * alone. A supervisor part-way through an assessment when this version
 * deployed keeps every score they had entered; they simply start with no
 * criterion comments, which is the correct state — those boxes did not exist
 * when they typed.
 */
export async function loadDraft(key: string): Promise<DraftState | undefined> {
  const record = await db.drafts.get(key);
  if (!record) return undefined;
  return {
    marks: record.marks,
    sectionComments: record.sectionComments ?? {},
    generalComment: record.generalComment ?? '',
    // Absent in every draft written before this field existed, and absent is
    // the correct answer for those: nobody chose a date.
    assessedOn: record.assessedOn ?? null,
  };
}

export async function saveDraft(key: string, state: DraftState): Promise<void> {
  await db.drafts.put({
    key,
    marks: state.marks,
    sectionComments: state.sectionComments,
    generalComment: state.generalComment,
    assessedOn: state.assessedOn,
    updatedAt: Date.now(),
  });
}

export async function clearDraft(key: string): Promise<void> {
  await db.drafts.delete(key);
}

/**
 * Trainee ids with at least one unsubmitted draft on this device. Drives
 * the route list's "in progress" counter — for an IPT trainee (a single
 * instrument) a local draft is the only evidence that marking has started
 * but not finished, since nothing reaches the server until submit.
 */
export async function traineeIdsWithDrafts(): Promise<Set<string>> {
  const keys = (await db.drafts.toCollection().primaryKeys()) as string[];
  const ids = new Set<string>();
  for (const key of keys) {
    const traineeId = key.split(':')[0];
    if (traineeId) ids.add(traineeId);
  }
  return ids;
}

export interface DraftMarksRow {
  traineeId: string;
  instrumentId: string;
  marks: MarksByCriterion;
}

/**
 * Every draft on this device, split back into (trainee, instrument).
 *
 * `traineeIdsWithDrafts` answers "has this trainee been started"; this answers
 * "how far", which is what tells a part-marked trainee (in progress) from one
 * whose whole assessment is sitting here finished and unsent (draft). The key
 * is `${traineeId}:${instrumentId}` and has been since the store existed, so
 * nothing new is stored to support the distinction.
 */
export async function listDraftMarks(): Promise<DraftMarksRow[]> {
  const records = await db.drafts.toArray();
  const rows: DraftMarksRow[] = [];
  for (const record of records) {
    const [traineeId, instrumentId] = record.key.split(':');
    if (!traineeId || !instrumentId) continue;
    rows.push({ traineeId, instrumentId, marks: record.marks ?? {} });
  }
  return rows;
}
