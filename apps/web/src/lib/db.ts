import Dexie, { type Table } from 'dexie';
import type { CriterionRow, MarksByCriterion } from './marking';
import type { SubmitAssessmentInput } from './submission';
import type { TraineeStatus } from './trainees';

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

/**
 * Everything needed to mark any trainee on the supervisor's route with no
 * network at all, written whenever the route list loads online. Stored as a
 * single record: the whole route is one consistent snapshot, and replacing
 * it wholesale avoids a half-updated cache after a partial load.
 *
 * Criteria for every instrument are included (89 rows across all three) —
 * cheap, and it means one online visit to the route list arms the entire
 * route, rather than requiring the supervisor to pre-open each trainee.
 */
export interface OfflineTrainee {
  id: string;
  name: string;
  occupation: string;
  institution: string;
  track: 'TP' | 'IPT';
  status: TraineeStatus;
  /** This supervisor's own slot for this trainee. Absent if unassigned. */
  slot: 'a1' | 'a2' | null;
  /** Instrument ids this supervisor has already submitted for this trainee. */
  submittedInstrumentIds: string[];
}

export interface OfflineInstrument {
  id: string;
  code: string;
  label: string;
  track: 'TP' | 'IPT';
  criteria: CriterionRow[];
}

export interface OfflineBundle {
  key: 'route';
  routeCode: string;
  routeLabel: string | null;
  trainees: OfflineTrainee[];
  instruments: OfflineInstrument[];
  cachedAt: number;
}

class TathminiDb extends Dexie {
  drafts!: Table<DraftRecord, string>;
  outbox!: Table<OutboxRecord, string>;
  cache!: Table<OfflineBundle, string>;

  constructor() {
    super('tathmini-drafts');
    this.version(1).stores({ drafts: 'key' });
    this.version(2).stores({ drafts: 'key', outbox: 'key' });
    this.version(3).stores({ drafts: 'key', outbox: 'key', cache: 'key' });
  }
}

export const db = new TathminiDb();
