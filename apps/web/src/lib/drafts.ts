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

export function draftKey(traineeId: string, instrumentId: string): string {
  return `${traineeId}:${instrumentId}`;
}

export async function loadDraft(key: string): Promise<MarksByCriterion | undefined> {
  const record = await db.drafts.get(key);
  return record?.marks;
}

export async function saveDraft(key: string, marks: MarksByCriterion): Promise<void> {
  await db.drafts.put({ key, marks, updatedAt: Date.now() });
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
