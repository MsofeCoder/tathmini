import Dexie, { type Table } from 'dexie';
import type { CriterionRow, MarksByCriterion } from './marking';
import type { SubmitAssessmentInput } from './submission';
import type { TraineeStatus } from './trainees';

/**
 * The on-device store (Dexie/IndexedDB) — and, since the local-first
 * rebuild, the app's PRIMARY read source rather than a fallback copy of one.
 *
 * Every screen a supervisor uses in the field reads from here and nowhere
 * else, so the same code renders with a full signal, a dead one, or a hotel
 * wifi that routes nowhere. The network's job is reduced to two things it is
 * genuinely needed for: filling these tables (`lib/sync/`) and carrying work
 * out (`outbox`, `reportOutbox`).
 *
 * Two families of table, and the difference matters:
 *
 * - **Replicas** — `trainees`, `assignments`, `instruments`, `criteria`,
 *   `marks`, `results`, `reports`. Server-owned rows, mirrored verbatim.
 *   Safe to wipe and refetch at any moment, because the server holds the
 *   truth. Nothing derived is stored: status, counters and progress are
 *   computed at render time by the same pure functions the server used to
 *   call, so a cached number can never disagree with the rows behind it.
 * - **Work in hand** — `drafts`, `outbox`, `reportOutbox`. Written by the
 *   supervisor and existing NOWHERE else until they drain. These are never
 *   wiped by a sync, a sign-out or a user switch; losing one loses marks
 *   that cannot be redone.
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
  /** See OutboxRecord.userId — same reasoning, same shared device. */
  userId?: string;
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
  /**
   * Who marked this. Phones get shared between tutors, and a submission
   * carries a slot that belongs to one supervisor — replaying Fatuma's queued
   * marks under Juma's session cannot succeed, it can only fail against RLS
   * on every pass while the attempt counter climbs and the real owner's work
   * looks like it is being retried. The drainer sends only the signed-in
   * user's entries and leaves the rest untouched until that person signs back
   * in. Optional: records queued before this existed have no owner recorded,
   * and are drained as they always were rather than stranded.
   */
  userId?: string;
}

/* ------------------------------------------------------------------ *
 * Replicas of the server's rows.
 *
 * Column names are the app's camelCase, not PostgREST's snake_case: the
 * mapping happens once, in lib/sync/, so nothing downstream has to know
 * which side of the wire a row came from. Both the full sync and a single
 * Realtime change land in the same shape, which is what lets one screen
 * read them without caring how they arrived.
 * ------------------------------------------------------------------ */

/** One row of `trainees`, as the register holds it. */
export interface LocalTrainee {
  id: string;
  name: string;
  occupation: string;
  institution: string;
  track: 'TP' | 'IPT';
  routeId: string | null;
  registrationNumber: string | null;
  course: string;
  modeOfStudy: string | null;
  region: string | null;
  district: string | null;
  email: string | null;
  phone: string | null;
}

/** THIS supervisor's own slot for a trainee. Absent if they are unassigned. */
export interface LocalAssignment {
  traineeId: string;
  slot: 'a1' | 'a2';
}

export interface LocalInstrument {
  id: string;
  code: string;
  label: string;
  track: 'TP' | 'IPT';
  maxTotal: number;
}

/** A criterion row, with the instrument it belongs to. */
export type LocalCriterion = CriterionRow & { instrumentId: string };

/**
 * One of THIS supervisor's own `assessment_marks` rows. Keyed
 * `${traineeId}:${instrumentId}` — the same key the draft and the outbox
 * entry for that piece of work use, so all three are always talking about
 * the same assessment.
 */
export interface LocalMark {
  key: string;
  traineeId: string;
  instrumentId: string;
  submittedAt: string | null;
}

/** `results.locked_at` — set once both assessors are in. */
export interface LocalResult {
  traineeId: string;
  lockedAt: string | null;
}

/** This assessor's own stored report, if they have already sent one. */
export interface LocalReport {
  traineeId: string;
  generatedAt: string;
}

/**
 * Single-row tables, keyed by a constant. `session` is the important one:
 * it is what tells a cold, offline start who is signed in and which route
 * they are on, without a network call to ask.
 */
export interface SessionMeta {
  key: 'session';
  userId: string;
  name: string;
  role: string;
  mustChangePassword: boolean;
  routeCode: string;
  routeLabel: string | null;
  /** Epoch ms of the last successful full sync. Shown to the supervisor. */
  syncedAt: number;
}

export type MetaRecord = SessionMeta;

/**
 * The pre-local-first snapshot: the whole route as one blob, written only
 * when the online route list rendered. Kept in the schema so the v5 upgrade
 * can read it — a phone that upgrades while standing in a dead zone has
 * this and nothing else, and must not be left with an empty app. Populated
 * by nothing any more; deleted once its contents have been unpacked.
 */
export interface OfflineTrainee {
  id: string;
  name: string;
  occupation: string;
  institution: string;
  track: 'TP' | 'IPT';
  status: TraineeStatus;
  slot: 'a1' | 'a2' | null;
  submittedInstrumentIds: string[];
  registrationNumber: string | null;
  course: string;
  modeOfStudy: string | null;
  region: string | null;
  district: string | null;
  email: string | null;
  phone: string | null;
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
  supervisorName: string;
  cachedAt: number;
}

class TathminiDb extends Dexie {
  drafts!: Table<DraftRecord, string>;
  outbox!: Table<OutboxRecord, string>;
  cache!: Table<OfflineBundle, string>;
  reportOutbox!: Table<ReportOutboxRecord, string>;

  trainees!: Table<LocalTrainee, string>;
  assignments!: Table<LocalAssignment, string>;
  instruments!: Table<LocalInstrument, string>;
  criteria!: Table<LocalCriterion, string>;
  marks!: Table<LocalMark, string>;
  results!: Table<LocalResult, string>;
  reports!: Table<LocalReport, string>;
  meta!: Table<MetaRecord, string>;

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
    // v5 turns the store into a real local database: the one-blob route
    // snapshot becomes tables the app reads directly. `cache` is still
    // declared — dropping a store discards its contents, and the upgrade
    // below is the only thing standing between an offline phone and an empty
    // route list.
    this.version(5)
      .stores({
        drafts: 'key',
        outbox: 'key',
        cache: 'key',
        reportOutbox: 'key',
        trainees: 'id, track, routeId',
        assignments: 'traineeId',
        instruments: 'id, code, track',
        criteria: 'id, instrumentId',
        marks: 'key, traineeId, instrumentId',
        results: 'traineeId',
        reports: 'traineeId',
        meta: 'key',
      })
      .upgrade(async (tx) => {
        // Unpack the old snapshot in place. A supervisor who upgrades in a
        // village keeps their whole route; one who upgrades on wifi gets the
        // same rows overwritten by the first sync moments later, which costs
        // nothing.
        const bundle = (await tx.table('cache').get('route')) as OfflineBundle | undefined;
        if (!bundle) return;

        await tx.table('trainees').bulkPut(
          bundle.trainees.map((t) => ({
            id: t.id,
            name: t.name,
            occupation: t.occupation,
            institution: t.institution,
            track: t.track,
            routeId: null,
            registrationNumber: t.registrationNumber,
            course: t.course,
            modeOfStudy: t.modeOfStudy,
            region: t.region,
            district: t.district,
            email: t.email,
            phone: t.phone,
          })),
        );

        await tx
          .table('assignments')
          .bulkPut(
            bundle.trainees
              .filter((t) => t.slot !== null)
              .map((t) => ({ traineeId: t.id, slot: t.slot as 'a1' | 'a2' })),
          );

        await tx.table('instruments').bulkPut(
          bundle.instruments.map((i) => ({
            id: i.id,
            code: i.code,
            label: i.label,
            track: i.track,
            // The old bundle never carried max_total; the first sync fills it
            // in. 0 renders the points label as "0 pts" rather than crashing,
            // and only until then.
            maxTotal: 0,
          })),
        );

        await tx
          .table('criteria')
          .bulkPut(
            bundle.instruments.flatMap((i) =>
              i.criteria.map((c) => ({ ...c, instrumentId: i.id })),
            ),
          );

        // The old snapshot recorded WHICH instruments were submitted but not
        // when, and a submitted mark's timestamp is not something the device
        // can invent. `submittedAt: null` would read as "not submitted", so
        // the bundle's own cache time stands in until the first sync replaces
        // these rows with the server's real ones.
        const stamp = new Date(bundle.cachedAt).toISOString();
        await tx.table('marks').bulkPut(
          bundle.trainees.flatMap((t) =>
            t.submittedInstrumentIds.map((instrumentId) => ({
              key: `${t.id}:${instrumentId}`,
              traineeId: t.id,
              instrumentId,
              submittedAt: stamp,
            })),
          ),
        );

        await tx
          .table('results')
          .bulkPut(
            bundle.trainees
              .filter((t) => t.status === 'locked')
              .map((t) => ({ traineeId: t.id, lockedAt: stamp })),
          );

        // No userId: the old bundle never recorded one, and guessing would be
        // worse than the honest gap. runFullSync stamps it on the next sync.
        await tx.table('meta').put({
          key: 'session',
          userId: '',
          name: bundle.supervisorName,
          role: 'supervisor',
          mustChangePassword: false,
          routeCode: bundle.routeCode,
          routeLabel: bundle.routeLabel,
          syncedAt: bundle.cachedAt,
        });

        await tx.table('cache').delete('route');
      });
  }
}

export const db = new TathminiDb();

/** Every replica table, in one place — what a sync replaces and a user switch clears. */
export const REPLICA_TABLES = [
  'trainees',
  'assignments',
  'instruments',
  'criteria',
  'marks',
  'results',
  'reports',
] as const;
