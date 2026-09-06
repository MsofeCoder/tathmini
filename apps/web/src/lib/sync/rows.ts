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
 * One definition of how a Postgres row becomes a local row.
 *
 * Both paths into IndexedDB use these: the full sync (`collect.ts`, on the
 * server) and a single Realtime change (`realtime.ts`, in the browser).
 * PostgREST and the Realtime socket hand over the same snake_case columns, so
 * writing the mapping twice would mean two chances to disagree — and the way
 * that failure shows up is a row that looks right until a supervisor taps it.
 *
 * Two conversions here are load-bearing rather than cosmetic:
 *
 * - **Numerics.** Postgres `numeric` arrives as a STRING over both transports.
 *   `section_max` left as "50" makes `subtotal > sectionMax` a string
 *   comparison and `total + itemMax` produce "4550". Converted once, here.
 * - **Nulls.** A nullable column arrives as `null`; `undefined` in an
 *   IndexedDB record means "no such field", which Dexie will happily store and
 *   which reads back differently. Normalised to `null` so a round trip through
 *   the device cannot change a value's meaning.
 */

/** The loose shape a PostgREST/Realtime row arrives in. */
export type Row = Record<string, unknown>;

const str = (value: unknown): string => (value == null ? '' : String(value));
const nullableStr = (value: unknown): string | null => (value == null ? null : String(value));
const num = (value: unknown): number => Number(value ?? 0);

export function toLocalTrainee(row: Row): LocalTrainee {
  return {
    id: str(row.id),
    name: str(row.name),
    occupation: str(row.occupation),
    institution: str(row.institution),
    track: row.track === 'IPT' ? 'IPT' : 'TP',
    routeId: nullableStr(row.route_id),
    registrationNumber: nullableStr(row.registration_number),
    course: str(row.course),
    modeOfStudy: nullableStr(row.mode_of_study),
    region: nullableStr(row.region),
    district: nullableStr(row.district),
    email: nullableStr(row.email),
    phone: nullableStr(row.phone),
  };
}

export function toLocalAssignment(row: Row): LocalAssignment {
  return {
    traineeId: str(row.trainee_id),
    slot: row.slot === 'a2' ? 'a2' : 'a1',
  };
}

export function toLocalInstrument(row: Row): LocalInstrument {
  return {
    id: str(row.id),
    code: str(row.code),
    label: str(row.label),
    track: row.track === 'IPT' ? 'IPT' : 'TP',
    maxTotal: num(row.max_total),
  };
}

export function toLocalCriterion(row: Row): LocalCriterion {
  return {
    id: str(row.id),
    instrumentId: str(row.instrument_id),
    sectionCode: str(row.section_code),
    sectionLabel: str(row.section_label),
    sectionMax: num(row.section_max),
    itemCode: str(row.item_code),
    itemLabel: str(row.item_label),
    itemMax: num(row.item_max),
    orderIndex: num(row.order_index),
  };
}

/** Keyed `${traineeId}:${instrumentId}` — the same key the draft and the
 * outbox entry for that piece of work use, so all three always refer to the
 * same assessment. */
export function markKey(traineeId: string, instrumentId: string): string {
  return `${traineeId}:${instrumentId}`;
}

export function toLocalMark(row: Row): LocalMark {
  const traineeId = str(row.trainee_id);
  const instrumentId = str(row.instrument_id);
  return {
    key: markKey(traineeId, instrumentId),
    traineeId,
    instrumentId,
    submittedAt: nullableStr(row.submitted_at),
  };
}

export function toLocalResult(row: Row): LocalResult {
  return {
    traineeId: str(row.trainee_id),
    lockedAt: nullableStr(row.locked_at),
  };
}

export function toLocalReport(row: Row): LocalReport {
  return {
    traineeId: str(row.trainee_id),
    generatedAt: str(row.generated_at),
  };
}
