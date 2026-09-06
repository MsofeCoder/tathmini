import {
  toLocalAssignment,
  toLocalCriterion,
  toLocalInstrument,
  toLocalMark,
  toLocalReport,
  toLocalResult,
  toLocalTrainee,
  type Row,
} from './rows';

/**
 * What a single Realtime change means for the device's copy — decided as a
 * plain value so it can be tested without a socket, a browser or IndexedDB.
 *
 * The subtlety worth writing down is DELETE. Postgres sends the full new row
 * on INSERT and UPDATE, but on DELETE it sends only the columns of the
 * replica identity, which by default is the primary key. Every table here has
 * a surrogate `id` primary key, so a delete arrives as `{ id: <uuid> }` and
 * nothing else.
 *
 * For `trainees`, `instruments` and `criteria` that is enough: the device
 * stores them under the same `id`. For the other four it is not — the device
 * keys `assignments` and `results` by trainee, and `marks` by
 * `${trainee}:${instrument}` — so the uuid in the payload matches nothing
 * locally and the row would silently survive its own deletion. Those ask for
 * a full re-sync instead, which is a few tens of kilobytes and always correct.
 * Guessing would be worse than a round trip: the failure it produces is a
 * trainee who stays on a supervisor's list after being moved off their route.
 */
export type LocalWritePlan =
  | { kind: 'put'; table: LocalTableName; row: unknown }
  | { kind: 'delete'; table: LocalTableName; key: string }
  /** The change cannot be applied precisely; refill from the server. */
  | { kind: 'resync' }
  /** A table we do not mirror, or a payload with nothing usable in it. */
  | { kind: 'ignore' };

export type LocalTableName =
  'trainees' | 'assignments' | 'instruments' | 'criteria' | 'marks' | 'results' | 'reports';

export interface ChangeEvent {
  table: string;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new?: Row;
  old?: Row;
}

/** Postgres table → the local table it feeds, how to map a row, and whether a
 * delete can be resolved from the primary key alone. */
const MIRRORED: Record<
  string,
  { table: LocalTableName; map: (row: Row) => unknown; deletableById: boolean }
> = {
  trainees: { table: 'trainees', map: toLocalTrainee, deletableById: true },
  instruments: { table: 'instruments', map: toLocalInstrument, deletableById: true },
  criteria: { table: 'criteria', map: toLocalCriterion, deletableById: true },
  assignments: { table: 'assignments', map: toLocalAssignment, deletableById: false },
  assessment_marks: { table: 'marks', map: toLocalMark, deletableById: false },
  results: { table: 'results', map: toLocalResult, deletableById: false },
  reports: { table: 'reports', map: toLocalReport, deletableById: false },
};

export function planLocalWrite(event: ChangeEvent): LocalWritePlan {
  const mirror = MIRRORED[event.table];
  if (!mirror) return { kind: 'ignore' };

  if (event.eventType === 'DELETE') {
    const id = event.old?.id;
    if (!mirror.deletableById || typeof id !== 'string' || id === '') {
      return { kind: 'resync' };
    }
    return { kind: 'delete', table: mirror.table, key: id };
  }

  const row = event.new;
  // An INSERT or UPDATE with no row is not something to act on. It happens
  // when RLS filters the change: the socket says something moved, without
  // saying what, and the honest response is to leave the device alone rather
  // than write a record built from empty strings.
  if (!row || Object.keys(row).length === 0) return { kind: 'ignore' };

  return { kind: 'put', table: mirror.table, row: mirror.map(row) };
}

/**
 * The tables to subscribe to — the same six migration 0028 adds to the
 * `supabase_realtime` publication.
 *
 * `reports` is mirrored but NOT subscribed, deliberately. The only row this
 * supervisor can have is one this device just created by sending a report, so
 * a socket message would tell it something it already knows; the next full
 * sync carries it. Subscribing to a table that is not in the publication is
 * silent — no error, no events — so the two lists are kept in step here
 * rather than discovered in the field.
 */
export const SUBSCRIBED_TABLES = [
  'trainees',
  'assignments',
  'instruments',
  'criteria',
  'assessment_marks',
  'results',
] as const;
