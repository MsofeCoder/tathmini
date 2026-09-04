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
