import Dexie, { type Table } from 'dexie';
import type { MarksByCriterion } from './marking';
import type { SubmitAssessmentInput } from './submission';

/**
 * The on-device store (Dexie/IndexedDB). Two tables, both keyed by the same
 * `${traineeId}:${instrumentId}` string so a draft and its queued submission
 * are always talking about the same piece of work:
 *
 * - `drafts` — every score/comment as the supervisor types it, so a crash,
 *   reload or battery death loses nothing.
 * - `outbox` — a completed submission that could not reach the server yet.
 *   The key doubles as the idempotency key; the database's own unique index
 *   on (trainee, instrument, slot) is the real backstop.
 *
 * Never imported from a Server Component or Server Action — IndexedDB does
 * not exist there.
 */

export interface DraftRecord {
  key: string;
  marks: MarksByCriterion;
  updatedAt: number;
}

export interface OutboxRecord {
  key: string;
  payload: SubmitAssessmentInput;
  /** For the "waiting to send" copy, so the queue can be described without a network round trip. */
  traineeName: string;
  instrumentLabel: string;
  queuedAt: number;
  attempts: number;
  lastError: string | null;
}

class TathminiDb extends Dexie {
  drafts!: Table<DraftRecord, string>;
  outbox!: Table<OutboxRecord, string>;

  constructor() {
    super('tathmini-drafts');
    this.version(1).stores({ drafts: 'key' });
    this.version(2).stores({ drafts: 'key', outbox: 'key' });
  }
}

export const db = new TathminiDb();
