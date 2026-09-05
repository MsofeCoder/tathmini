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
  /**
   * Both optional because records written before 2026-09-05 do not have them,
   * and a supervisor's half-finished draft must survive the deploy that
   * introduced them. `loadDraft` fills the defaults; nothing else may assume
   * these are present on a stored record.
   */
  sectionComments?: Record<string, string>;
  generalComment?: string;
  updatedAt: number;
}

/**
 * A queued "send the report" instruction. Holds no payload: the report is
 * built server-side from the marks that are already in the database by the
 * time this drains, so keeping a copy here would only risk the two
 * disagreeing. See lib/report-outbox.ts.
 */
export interface ReportOutboxRecord {
  /** The trainee id — one report per trainee per assessor. */
  key: string;
  /** For the "waiting to send" copy, so the queue reads without a network round trip. */
  traineeName: string;
  queuedAt: number;
  attempts: number;
  lastError: string | null;
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

  // The rest of the register's particulars. Cached so the offline profile is
  // the same screen as the online one rather than a cut-down stand-in, and so
  // the offline report preview can print a complete VETA heading — the whole
  // point of "nothing is typed in the field" is that these travel with the
  // supervisor.
  registrationNumber: string | null;
  course: string;
  modeOfStudy: string | null;
  region: string | null;
  district: string | null;
  email: string | null;
  phone: string | null;

  /**
   * Counts behind the route list's tiles. deriveStatus() collapses "some
   * instruments submitted" and "none" both to 'pending', so the raw numbers
   * have to travel too or the offline counters would disagree with the online
   * ones on exactly the trainees a supervisor is midway through.
   */
  ownSubmittedCount: number;
  requiredCount: number;
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
  /** Signs the offline report preview, as it does the online one. */
  supervisorName: string;
  cachedAt: number;
}

class TathminiDb extends Dexie {
  drafts!: Table<DraftRecord, string>;
  outbox!: Table<OutboxRecord, string>;
  cache!: Table<OfflineBundle, string>;
  reportOutbox!: Table<ReportOutboxRecord, string>;

  constructor() {
    super('tathmini-drafts');
    this.version(1).stores({ drafts: 'key' });
    this.version(2).stores({ drafts: 'key', outbox: 'key' });
    this.version(3).stores({ drafts: 'key', outbox: 'key', cache: 'key' });
    // v4 adds reportOutbox. Dexie carries the earlier stores forward, so a
    // device mid-route keeps its drafts, its queued marks and its route
    // snapshot across the upgrade — losing any of those would lose work a
    // supervisor cannot redo.
    this.version(4).stores({
      drafts: 'key',
      outbox: 'key',
      cache: 'key',
      reportOutbox: 'key',
    });
  }
}

export const db = new TathminiDb();
