import type {
  LocalAssignment,
  LocalCriterion,
  LocalInstrument,
  LocalMark,
  LocalReport,
  LocalResult,
  LocalTrainee,
} from '../db';

/**
 * The wire shape of a full sync — everything the signed-in user may read,
 * in one payload, already in the app's own camelCase.
 *
 * Deliberately one round trip rather than a table-per-request API. The
 * supervisors this serves are on 3G at best, where seven sequential requests
 * cost seven times the latency and can half-fail: a route list holding
 * trainees but no criteria is worse than no route list at all, because it
 * looks like it works right up to the moment somebody taps Start. One
 * payload either arrives or does not, and `applySync` writes it in a single
 * Dexie transaction, so the device is never left half-updated.
 *
 * It is small. The College's largest route is a few dozen trainees, and the
 * criteria are 89 rows shared by everyone — measured in tens of kilobytes,
 * not megabytes, which is why a full refresh beats delta bookkeeping here
 * (most of these tables have no `updated_at` to compute a delta from).
 */
export interface SyncSession {
  userId: string;
  name: string;
  role: string;
  mustChangePassword: boolean;
  routeCode: string;
  routeLabel: string | null;
}

export interface SyncPayload {
  session: SyncSession;
  trainees: LocalTrainee[];
  assignments: LocalAssignment[];
  instruments: LocalInstrument[];
  criteria: LocalCriterion[];
  marks: LocalMark[];
  results: LocalResult[];
  reports: LocalReport[];
}

/** What `/api/sync` returns when there is no usable session. */
export interface SyncUnauthorized {
  error: 'unauthenticated';
}
