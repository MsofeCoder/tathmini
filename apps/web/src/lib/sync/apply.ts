import type { Table } from 'dexie';
import { db, REPLICA_TABLES, type SessionMeta } from '../db';
import { shouldWipeReplicas, staleIds } from './reconcile';
import type { SyncPayload } from './types';

export { shouldWipeReplicas, staleIds } from './reconcile';

/**
 * Writing a sync payload onto the device.
 *
 * The two decisions worth getting right — whether these replicas belong to
 * somebody else, and which local rows the server no longer has — live in
 * `reconcile.ts`, free of Dexie so they can be tested without a browser.
 * Re-exported here because this is where callers look for them.
 */

/**
 * Replaces the device's replica of the server's rows with `payload`, in one
 * transaction.
 *
 * One transaction because a half-applied sync is the failure mode that
 * matters: trainees written and criteria not means a route list whose Start
 * button opens an empty form. Dexie rolls the whole thing back if any table
 * fails, so the device keeps the previous consistent snapshot instead.
 *
 * `drafts`, `outbox` and `reportOutbox` are deliberately absent from this
 * function. They hold work that exists nowhere else until it drains, and a
 * refresh of server-owned rows is never a reason to touch them — not even on
 * a user switch, where the queued marks still belong to whoever typed them
 * and are sent when that person signs back in (see OutboxRecord.userId).
 */
export async function applySync(payload: SyncPayload): Promise<void> {
  const stored = (await db.meta.get('session')) as SessionMeta | undefined;
  const wipe = shouldWipeReplicas(stored?.userId, payload.session.userId);

  await db.transaction(
    'rw',
    [
      db.trainees,
      db.assignments,
      db.instruments,
      db.criteria,
      db.marks,
      db.results,
      db.reports,
      db.meta,
    ],
    async () => {
      if (wipe) {
        await Promise.all(REPLICA_TABLES.map((name) => db.table(name).clear()));
      }

      await Promise.all([
        replace(db.trainees, 'id', payload.trainees),
        replace(db.assignments, 'traineeId', payload.assignments),
        replace(db.instruments, 'id', payload.instruments),
        replace(db.criteria, 'id', payload.criteria),
        replace(db.marks, 'key', payload.marks),
        replace(db.results, 'traineeId', payload.results),
        replace(db.reports, 'traineeId', payload.reports),
      ]);

      const session: SessionMeta = {
        key: 'session',
        ...payload.session,
        syncedAt: Date.now(),
      };
      await db.meta.put(session);
    },
  );
}

/**
 * Upsert every row in `rows`, then delete whatever the server did not send.
 *
 * Upsert-then-prune rather than clear-then-write: clearing first leaves the
 * table momentarily empty, and a `useLiveQuery` reading it at that instant
 * renders an empty route list. It is a transaction, so this is not visible in
 * practice — but it costs nothing to be right about, and a supervisor
 * watching their trainees blink out of existence would never trust the app
 * again.
 */
async function replace<T>(table: Table<T, string>, keyField: keyof T, rows: T[]): Promise<void> {
  const localIds = (await table.toCollection().primaryKeys()) as string[];
  await table.bulkPut(rows);
  const gone = staleIds(
    localIds,
    rows.map((row) => String(row[keyField])),
  );
  if (gone.length > 0) await table.bulkDelete(gone);
}

/**
 * Drops the device's copy of the server's rows, keeping work in hand.
 *
 * Called on sign-out. Phones are shared between tutors at the College, and
 * the previous version left a whole route — names, phone numbers, e-mail
 * addresses — sitting in IndexedDB for whoever picked the phone up next.
 * `applySync` already wipes on a user SWITCH, but that only fires once
 * somebody else signs in and syncs; this closes the gap in between.
 *
 * `drafts`, `outbox` and `reportOutbox` survive deliberately. They hold marks
 * that exist nowhere else, and signing out is not a statement about them —
 * the Account screen tells the supervisor to check Pending is empty first,
 * and if they did not, their work is still here when they sign back in.
 */
export async function clearReplicas(): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.trainees,
      db.assignments,
      db.instruments,
      db.criteria,
      db.marks,
      db.results,
      db.reports,
      db.meta,
    ],
    async () => {
      await Promise.all(REPLICA_TABLES.map((name) => db.table(name).clear()));
      await db.meta.clear();
    },
  );
}
