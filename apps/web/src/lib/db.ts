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

/**
 * A report the supervisor has finished but chosen not to send yet.
 *
 * Deliberately holds NO document. Nothing is rendered when a draft is saved,
 * so the PDF — and the submission date printed on it — is produced at the
 * moment the supervisor actually sends, days later if they like. A draft that
 * carried a pre-rendered report would carry the wrong date the moment it was
 * left overnight.
 *
 * On the device rather than in the database, like every other draft here: the
 * decision to hold a report back is personal to the supervisor and has to
 * survive with no signal, which is exactly when it gets made.
 */
export interface ReportDraftRecord {
  /** The trainee id — one report per trainee per assessor. */
  key: string;
  traineeName: string;
  savedAt: number;
  /** The supervisor's own note to themselves, e.g. "check the spelling first". */
  note?: string;
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
  /**
   * Epoch ms before which this must not be retried — the exponential backoff
   * in outbox.ts. Optional because records queued before backoff existed do
   * not have it; those are treated as due immediately rather than stranded.
   */
  nextAttemptAt?: number;
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
  reportDrafts!: Table<ReportDraftRecord, string>;

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
    /**
     * v6 exists only because v5 shipped and was withdrawn.
     *
     * Between this morning and this revert, a build was live that declared
     * version 5 and created a table per entity (trainees, assignments,
     * instruments, criteria, marks, results, reports, meta). Every phone that
     * opened it has an IndexedDB stamped 5. IndexedDB refuses to open a
     * database whose stored version is HIGHER than the one the code asks for,
     * so a build declaring 4 would throw VersionError on exactly those devices
     * — the app would not start at all, and the supervisor would have no way
     * to reach their queued work.
     *
     * Declaring 6 makes it an upgrade rather than a downgrade. The v5 tables
     * are dropped by giving them a null schema, which is Dexie's own way of
     * saying "this store is gone". `drafts`, `outbox`, `cache` and
     * `reportOutbox` are untouched, so nothing a supervisor has marked or
     * queued is lost by the revert.
     *
     * A phone that never opened the v5 build skips straight from 4 to 6 and
     * has nothing to drop.
     */
    this.version(6).stores({
      drafts: 'key',
      outbox: 'key',
      cache: 'key',
      reportOutbox: 'key',
      trainees: null,
      assignments: null,
      instruments: null,
      criteria: null,
      marks: null,
      results: null,
      reports: null,
      meta: null,
    });

    /**
     * v7 adds `reportDrafts` — a report the supervisor has finished and chosen
     * not to send yet.
     *
     * It is 7 rather than 5 because 5 and 6 are both spent: 5 by the withdrawn
     * local-database build, 6 by the migration that undoes it. A version number
     * is never reused once a build carrying it has reached a device, or a phone
     * that opened the earlier one would be told its database is already newer
     * than the code and refuse to open at all.
     *
     * Every earlier store is carried forward, as at every upgrade before this:
     * a supervisor mid-route keeps their drafts, their queued marks and their
     * route snapshot.
     */
    this.version(7).stores({
      drafts: 'key',
      outbox: 'key',
      cache: 'key',
      reportOutbox: 'key',
      reportDrafts: 'key',
    });
  }
}

export const db = new TathminiDb();
