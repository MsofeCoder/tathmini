import Dexie, { type Table } from 'dexie';
import type { MarksByCriterion } from './marking';

/**
 * Local-only draft store (Dexie/IndexedDB), scoped per (trainee, instrument).
 * HANDOFF.md's agreed offline-first cut: every criterion score/comment saves
 * here as the supervisor works, so reopening a trainee — even after a
 * crash/reload — restores the draft. Built in from the start of the marking
 * UI rather than bolted on after. This does NOT queue the submit itself
 * (that's a separate, not-yet-built outbox) — it only survives the drive
 * between "typed a mark" and "tapped submit".
 */

export interface DraftRecord {
  key: string; // `${traineeId}:${instrumentId}`
  marks: MarksByCriterion;
  updatedAt: number;
}

class TathminiDraftsDb extends Dexie {
  drafts!: Table<DraftRecord, string>;

  constructor() {
    super('tathmini-drafts');
    this.version(1).stores({ drafts: 'key' });
  }
}

// Instantiated once per browser tab. Never imported from a Server Component
// or Server Action — IndexedDB doesn't exist there.
export const draftsDb = new TathminiDraftsDb();

export function draftKey(traineeId: string, instrumentId: string): string {
  return `${traineeId}:${instrumentId}`;
}

export async function loadDraft(key: string): Promise<MarksByCriterion | undefined> {
  const record = await draftsDb.drafts.get(key);
  return record?.marks;
}

export async function saveDraft(key: string, marks: MarksByCriterion): Promise<void> {
  await draftsDb.drafts.put({ key, marks, updatedAt: Date.now() });
}

export async function clearDraft(key: string): Promise<void> {
  await draftsDb.drafts.delete(key);
}
