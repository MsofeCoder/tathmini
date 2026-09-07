import type { DraftMarksRow } from '../drafts';
import type {
  LocalAssignment,
  LocalCriterion,
  LocalInstrument,
  LocalMark,
  LocalReport,
  LocalResult,
  LocalTrainee,
  SentReportRecord,
  SessionMeta,
} from '../db';
import { instrumentOrder, isTpPhaseCode, TP_PHASE_CODES, type CriterionRow } from '../marking';
import { deriveStatus, type DraftProgress, type TraineeStatus } from '../trainees';

/**
 * Turning the device's rows into exactly what each screen already expected
 * from the server.
 *
 * Pure, and that is the point of the file existing. These are the numbers a
 * supervisor reads off a phone and acts on — whether a trainee is assessed,
 * whether their own half is finished, whether the Start button should be
 * there at all — and until now they were computed inside server components
 * where nothing could test them. The rules did not change in the move; they
 * were lifted out of `/home` and `/trainee/[id]` unaltered so the screens
 * render identically, and now they are asserted.
 *
 * Nothing derived is ever stored. Status and counters are recomputed from the
 * rows on every render, so a Realtime change to one mark cannot leave a
 * stale counter behind it.
 */

const ASSESSOR_SLOT_LABELS: Record<string, string> = {
  a1: 'Assessor 1',
  a2: 'Assessor 2',
};

export interface DeviceRows {
  trainees: LocalTrainee[];
  assignments: LocalAssignment[];
  instruments: LocalInstrument[];
  criteria: LocalCriterion[];
  marks: LocalMark[];
  results: LocalResult[];
  reports: LocalReport[];
  /**
   * On-device receipts for reports that have actually left this phone.
   *
   * Part of the replica's read set rather than a separate concern, because
   * `buildProfile` cannot answer "has this one already been sent" without it.
   * The server's `reports` row is the authority, but it arrives on the next
   * full sync — seconds later at best, and not at all until there is signal —
   * and the supervisor is looking at the trainee NOW. See `alreadySentAt`.
   */
  sentReports: SentReportRecord[];
  session: SessionMeta | null;
}

/** One row of the route list — the shape `RouteList` already takes. */
export interface RouteListRow {
  id: string;
  name: string;
  occupation: string;
  institution: string;
  track: 'TP' | 'IPT';
  status: TraineeStatus;
  ownSubmittedCount: number;
  requiredCount: number;
  /** How far the unsent work on THIS device has got. See draftProgressFor(). */
  draftProgress: DraftProgress;
}

/** How many instruments each track requires: TP 2 (theory + practical), IPT 1. */
function requiredByTrack(instruments: LocalInstrument[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const instrument of instruments) {
    counts.set(instrument.track, (counts.get(instrument.track) ?? 0) + 1);
  }
  return counts;
}

/** This supervisor's own SUBMITTED marks, counted per trainee. An unsubmitted
 * row is a mark that was started and never finalized, and must not count. */
function submittedByTrainee(marks: LocalMark[]): Map<string, string[]> {
  const byTrainee = new Map<string, string[]>();
  for (const mark of marks) {
    if (!mark.submittedAt) continue;
    const list = byTrainee.get(mark.traineeId) ?? [];
    list.push(mark.instrumentId);
    byTrainee.set(mark.traineeId, list);
  }
  return byTrainee;
}

function lockedByTrainee(results: LocalResult[]): Map<string, string | null> {
  return new Map(results.map((r) => [r.traineeId, r.lockedAt]));
}

/**
 * How far this device's unsent work on one trainee has got.
 *
 *   - `none` — nothing marked, or nothing left to mark.
 *   - `partial` — some criteria scored, but not every one of every lesson
 *     still to be submitted. This is work in progress in the plainest sense:
 *     the supervisor has started and has not finished.
 *   - `complete` — every criterion of every lesson still to be submitted
 *     carries a score. The assessment is finished and is sitting on this
 *     phone unsent: a DRAFT, whether or not the supervisor pressed anything
 *     to make it one.
 *
 * The rule is the same one `tpReadyToSubmit` uses to decide whether the
 * Submit button may appear, so a trainee reads as a draft on the route list
 * exactly when their profile offers to send them.
 */
export function draftProgressFor({
  trainee,
  instruments,
  criteria,
  submittedInstrumentIds,
  draftsByInstrument,
}: {
  trainee: LocalTrainee;
  instruments: LocalInstrument[];
  criteria: LocalCriterion[];
  submittedInstrumentIds: Set<string>;
  draftsByInstrument: Map<string, DraftMarksRow>;
}): DraftProgress {
  const pending = instruments.filter(
    (i) => i.track === trainee.track && !submittedInstrumentIds.has(i.id),
  );
  if (pending.length === 0) return 'none';

  let anyScored = false;
  let allComplete = true;

  for (const instrument of pending) {
    const rows = criteria.filter((c) => c.instrumentId === instrument.id);
    const marks = draftsByInstrument.get(instrument.id)?.marks ?? {};
    const scored = rows.filter((c) => marks[c.id]?.score != null).length;
    if (scored > 0) anyScored = true;
    // A lesson whose criteria have not reached this phone can never be
    // complete — an empty form is not a finished one.
    if (rows.length === 0 || scored < rows.length) allComplete = false;
  }

  if (allComplete) return 'complete';
  return anyScored ? 'partial' : 'none';
}

/**
 * The route list.
 *
 * Sorted by name — the one deliberate difference from the server-rendered
 * version, which returned whatever order Postgres happened to give it.
 * IndexedDB returns rows in primary-key order, and the primary key is a
 * random uuid, so leaving it unsorted would have shuffled a supervisor's
 * route on every sync. Alphabetical is also how the paper register reads.
 */
export function buildRouteRows(rows: DeviceRows, drafts: DraftMarksRow[] = []): RouteListRow[] {
  const required = requiredByTrack(rows.instruments);
  const submitted = submittedByTrainee(rows.marks);
  const locked = lockedByTrainee(rows.results);

  const draftsByTrainee = new Map<string, Map<string, DraftMarksRow>>();
  for (const draft of drafts) {
    const byInstrument = draftsByTrainee.get(draft.traineeId) ?? new Map<string, DraftMarksRow>();
    byInstrument.set(draft.instrumentId, draft);
    draftsByTrainee.set(draft.traineeId, byInstrument);
  }

  return rows.trainees
    .map((trainee) => {
      const submittedInstrumentIds = new Set(submitted.get(trainee.id) ?? []);
      const ownSubmittedCount = submittedInstrumentIds.size;
      const requiredCount = required.get(trainee.track) ?? 0;
      return {
        id: trainee.id,
        name: trainee.name,
        occupation: trainee.occupation,
        institution: trainee.institution,
        track: trainee.track,
        status: deriveStatus({
          lockedAt: locked.get(trainee.id),
          ownSubmittedCount,
          requiredCount,
        }),
        ownSubmittedCount,
        requiredCount,
        draftProgress: draftProgressFor({
          trainee,
          instruments: rows.instruments,
          criteria: rows.criteria,
          submittedInstrumentIds,
          draftsByInstrument: draftsByTrainee.get(trainee.id) ?? new Map(),
        }),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Per-instrument action on the profile — the shape `AssessmentActions` takes. */
export interface ProfileAction {
  instrumentId: string;
  code: string;
  label: string;
  submitted: boolean;
}

export interface ProfileView {
  trainee: LocalTrainee;
  slot: 'a1' | 'a2' | null;
  /** e.g. "J. Mwakalinga (Assessor 1 of 2)" */
  assessedByLabel: string;
  locked: boolean;
  actions: ProfileAction[];
  canAssess: boolean;
  /** Every instrument this track requires carries this supervisor's mark. */
  ownSlotComplete: boolean;
  /**
   * When this assessor already sent their report, if they have — from the
   * server's row or this phone's own receipt, whichever is available.
   */
  alreadySentAt: string | null;
  maxTotalByCode: Map<string, number>;
}

/**
 * The trainee profile. Returns null for an id the device does not hold, which
 * is what the screen renders as "not found" — the same answer the server gave
 * for a trainee RLS would not show this caller.
 */
export function buildProfile(rows: DeviceRows, traineeId: string): ProfileView | null {
  const trainee = rows.trainees.find((t) => t.id === traineeId);
  if (!trainee) return null;

  const assignment = rows.assignments.find((a) => a.traineeId === traineeId) ?? null;
  const slot = assignment?.slot ?? null;
  const slotLabel = slot ? ASSESSOR_SLOT_LABELS[slot] : null;
  const supervisorName = rows.session?.name ?? '';
  const assessedByLabel = slotLabel ? `${supervisorName} (${slotLabel} of 2)` : supervisorName;

  const locked = !!rows.results.find((r) => r.traineeId === traineeId)?.lockedAt;

  const submitted = new Set(
    rows.marks.filter((m) => m.traineeId === traineeId && m.submittedAt).map((m) => m.instrumentId),
  );

  // Theory before Practical — see `instrumentOrder`. IndexedDB hands these
  // back in primary-key order, and the primary key is a random uuid, so
  // without the sort the same trainee could offer the two TP buttons in
  // either order.
  const actions: ProfileAction[] = rows.instruments
    .filter((i) => i.track === trainee.track)
    .sort((a, b) => instrumentOrder(a.code) - instrumentOrder(b.code))
    .map((i) => ({
      instrumentId: i.id,
      code: i.code,
      label: i.label,
      submitted: submitted.has(i.id),
    }));

  return {
    trainee,
    slot,
    assessedByLabel,
    locked,
    actions,
    canAssess: !!assignment && !locked,
    // This supervisor has finished their own half — which, not `locked`, is
    // what makes a report available, so an absent second assessor never
    // blocks it.
    ownSlotComplete: !!assignment && actions.length > 0 && actions.every((a) => a.submitted),
    alreadySentAt: reportSentAt(rows, traineeId),
    maxTotalByCode: new Map(rows.instruments.map((i) => [i.code, i.maxTotal])),
  };
}

/**
 * When this supervisor's report for a trainee was sent — or null if it never
 * was.
 *
 * TWO sources, and both are needed. `rows.reports` is the server's own row,
 * replicated down: it is the authority, it survives a reinstall, and it is
 * what a second device would see. `rows.sentReports` is the receipt this
 * phone wrote the moment the server confirmed the send.
 *
 * Reading only the server row is the bug this function exists to fix. A
 * supervisor would send a report, watch it download, walk back to their route
 * and open the same trainee — and be offered "Submit and send report" all
 * over again, because the `reports` row had not synced down yet (and, with no
 * signal, would not for hours). The whole point of the send being irreversible
 * is that the app must never invite it twice.
 *
 * The server's timestamp WINS when both exist, so the date on this screen is
 * the date printed on the report itself rather than the moment this phone
 * happened to notice.
 */
export function reportSentAt(rows: DeviceRows, traineeId: string): string | null {
  const server = rows.reports.find((r) => r.traineeId === traineeId)?.generatedAt;
  if (server) return server;
  const receipt = rows.sentReports.find((r) => r.key === traineeId);
  return receipt ? new Date(receipt.sentAt).toISOString() : null;
}

export interface MarkingView {
  trainee: LocalTrainee;
  instrument: LocalInstrument;
  slot: 'a1' | 'a2';
  criteria: CriterionRow[];
  /** True once this supervisor's mark for this instrument is on the server. */
  alreadySubmitted: boolean;
}

/**
 * The marking screen, by instrument CODE — the segment the existing URL
 * carries (`/trainee/<id>/mark/tp_theory`), not an id, so a link a supervisor
 * bookmarked still resolves.
 *
 * Returns null when the device cannot honestly render the form: an unknown
 * trainee or instrument, a trainee this supervisor holds no slot for, or an
 * instrument that belongs to the other track. Every one of those mirrors a
 * guard the server used to make, each of which mirrors an RLS policy that
 * would refuse the write anyway (AGENTS.md rule 1) — this is the courtesy
 * layer, not the enforcement.
 */
export function buildMarking(
  rows: DeviceRows,
  traineeId: string,
  instrumentCode: string,
): MarkingView | null {
  const trainee = rows.trainees.find((t) => t.id === traineeId);
  if (!trainee) return null;

  const instrument = rows.instruments.find((i) => i.code === instrumentCode);
  if (!instrument || instrument.track !== trainee.track) return null;

  const assignment = rows.assignments.find((a) => a.traineeId === traineeId);
  if (!assignment) return null;

  // `instrumentId` is dropped on the way out: MarkingForm takes CriterionRow,
  // the same shape the server used to hand it, and the instrument is already
  // named beside it.
  const criteria: CriterionRow[] = rows.criteria
    .filter((c) => c.instrumentId === instrument.id)
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((c) => ({
      id: c.id,
      sectionCode: c.sectionCode,
      sectionLabel: c.sectionLabel,
      sectionMax: c.sectionMax,
      itemCode: c.itemCode,
      itemLabel: c.itemLabel,
      itemMax: c.itemMax,
      orderIndex: c.orderIndex,
    }));

  // A form with no criteria is not a form. It means the device holds the
  // instrument but not its rows — a sync that was interrupted before this
  // release made sync atomic — and offering it would let a supervisor
  // "complete" an empty assessment.
  if (criteria.length === 0) return null;

  return {
    trainee,
    instrument,
    slot: assignment.slot,
    criteria,
    alreadySubmitted: rows.marks.some(
      (m) => m.traineeId === traineeId && m.instrumentId === instrument.id && m.submittedAt,
    ),
  };
}

export interface TpPhaseView {
  instrument: LocalInstrument;
  criteria: CriterionRow[];
}

export interface TpMarkingView {
  trainee: LocalTrainee;
  slot: 'a1' | 'a2';
  /** Theory first, Practical second — and only the phases still to be marked. */
  phases: TpPhaseView[];
  /** Where in `phases` the url the supervisor opened lands. */
  startPhaseIndex: number;
}

/**
 * Every TP phase still to be marked, Theory first.
 *
 * TP is two instruments and one trainee, but NOT one walk: the profile is the
 * pre-assessment page and each lesson is opened from it on its own, in either
 * order, on different days if that is how the visits fall. This is the list
 * both the stepper and the profile's Submit button work from — the stepper to
 * know whether the lesson it is showing ends at Save or at Submit, the
 * profile to know whether the whole assessment can be sent.
 *
 * A phase already submitted is dropped rather than shown read-only: marks are
 * append-only, so re-opening one could only mislead. A phase whose criteria
 * have not reached this phone (an interrupted sync) is dropped too — the
 * other one is still markable, and an empty form never is.
 */
export function buildTpPending(rows: DeviceRows, traineeId: string): TpMarkingView | null {
  const trainee = rows.trainees.find((t) => t.id === traineeId);
  if (!trainee || trainee.track !== 'TP') return null;

  const assignment = rows.assignments.find((a) => a.traineeId === traineeId);
  if (!assignment) return null;

  const phases: TpPhaseView[] = [];
  for (const code of TP_PHASE_CODES) {
    const view = buildMarking(rows, traineeId, code);
    if (!view || view.alreadySubmitted) continue;
    phases.push({ instrument: view.instrument, criteria: view.criteria });
  }

  return { trainee, slot: assignment.slot, phases, startPhaseIndex: 0 };
}

/**
 * The same list, positioned on the phase whose url the supervisor opened.
 *
 * Returns null when that phase is not one of the pending ones — an unknown
 * code, the other track's instrument, or a lesson this supervisor has already
 * submitted (which the mark screen reports in its own words).
 */
export function buildTpMarking(
  rows: DeviceRows,
  traineeId: string,
  instrumentCode: string,
): TpMarkingView | null {
  if (!isTpPhaseCode(instrumentCode)) return null;

  const pending = buildTpPending(rows, traineeId);
  if (!pending) return null;

  const startPhaseIndex = pending.phases.findIndex((p) => p.instrument.code === instrumentCode);
  if (startPhaseIndex === -1) return null;

  return { ...pending, startPhaseIndex };
}
