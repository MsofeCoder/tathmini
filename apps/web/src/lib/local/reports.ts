import { buildRouteRows, type DeviceRows } from './derive';
import type { OutboxRecord, ReportDraftRecord, ReportOutboxRecord, SentReportRecord } from '../db';

/**
 * Which of the Reports screen's three lists a piece of work belongs to.
 *
 * The tabs are the three things that can happen when a supervisor finishes an
 * assessment and reaches the send screen:
 *
 * - DRAFTED — they tapped "Save as a draft and send later". Nothing was sent,
 *   and nothing ever will be until they come back. It is their decision, held
 *   on the device.
 * - PENDING — they tapped send, and it could not go: no signal, or the server
 *   refused. The work is queued and sends itself. The only wrong thing a
 *   supervisor can do here is mark the trainee again, because
 *   `assessment_marks` is append-only and a duplicate is permanent.
 * - SUBMITTED — it went. Marks are on the server, or the report has been sent
 *   from this phone.
 *
 * Derived entirely from the device, never from a query — like every other
 * screen in the field app. A supervisor opens this one precisely when the
 * network has let them down, so a list that needed the network to describe its
 * own backlog would be empty exactly when it matters.
 *
 * A pure function, kept out of the component for the same reason
 * `derive.ts` is: this is the part that can be wrong in a way nobody notices
 * until a supervisor is standing in a workshop, and it is the part a test can
 * actually pin down.
 */
export type ReportTab = 'drafted' | 'submitted' | 'pending';

export const REPORT_TABS: readonly { id: ReportTab; label: string }[] = [
  { id: 'drafted', label: 'Drafted' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'pending', label: 'Pending' },
];

/** A report the supervisor finished and chose to hold back. */
export interface DraftedRow {
  traineeId: string;
  traineeName: string;
  savedAt: number;
  note?: string;
}

/**
 * One queued item. Marks and reports are listed separately rather than rolled
 * up per trainee: they fail for different reasons, drain in a fixed order
 * (marks first — a report is built from marks the server must already hold),
 * and a supervisor who cannot tell which of the two is stuck cannot tell
 * whether anything is expected of them.
 */
export interface PendingRow {
  /** The queue key — `${traineeId}:${instrumentId}` for marks, the trainee id for reports. */
  key: string;
  traineeId: string;
  traineeName: string;
  kind: 'marks' | 'report';
  /** Only for marks — which instrument is waiting. */
  instrumentLabel?: string;
  queuedAt: number;
  attempts: number;
  lastError: string | null;
}

export interface SubmittedRow {
  traineeId: string;
  traineeName: string;
  /** When the report left this phone, if it did. Null when only the marks are in. */
  sentAt: number | null;
  /** Every instrument this supervisor owes for this trainee is submitted. */
  marksComplete: boolean;
}

export interface ReportsView {
  drafted: DraftedRow[];
  submitted: SubmittedRow[];
  pending: PendingRow[];
}

export interface BuildReportsInput {
  /** The device replica — trainees, their marks, and the server's own `reports` rows. */
  rows: DeviceRows;
  drafts: readonly ReportDraftRecord[];
  queuedMarks: readonly OutboxRecord[];
  queuedReports: readonly ReportOutboxRecord[];
  /** On-device receipts, for the gap before the server's row syncs down. */
  sentReports: readonly SentReportRecord[];
}

/**
 * The outbox is keyed per (trainee, instrument); the report queues per
 * trainee. Splitting on the FIRST colon, not the last, because a trainee id is
 * a UUID and an instrument id is not guaranteed to be colon-free forever.
 */
export function traineeIdFromOutboxKey(key: string): string {
  const at = key.indexOf(':');
  return at === -1 ? key : key.slice(0, at);
}

/**
 * Sorts work into the three tabs, each trainee appearing in exactly one.
 *
 * A trainee can genuinely be in more than one state at once — marks queued for
 * one instrument while a report for another sits as a draft — so the tabs are
 * ranked rather than merged: PENDING beats DRAFTED beats SUBMITTED. The reason
 * is what a supervisor must not conclude. Anything still queued has to be
 * visible as queued, because the mistake it prevents (marking that trainee a
 * second time) is permanent; and a held draft has to outrank "submitted",
 * because nothing sends a draft on its own and a trainee filed under
 * "Submitted" is one the supervisor stops thinking about.
 */
export function buildReportsView({
  rows,
  drafts,
  queuedMarks,
  queuedReports,
  sentReports,
}: BuildReportsInput): ReportsView {
  const trainees = buildRouteRows(rows);

  const nameById = new Map<string, string>();
  for (const trainee of trainees) nameById.set(trainee.id, trainee.name);
  // The queues and receipts carry their own copy of the name, so a trainee who
  // has since moved off this route still reads as a person rather than an id.
  for (const draft of drafts) nameById.set(draft.key, draft.traineeName);
  for (const sent of sentReports) nameById.set(sent.key, sent.traineeName);
  for (const report of queuedReports) nameById.set(report.key, report.traineeName);
  for (const mark of queuedMarks) {
    nameById.set(traineeIdFromOutboxKey(mark.key), mark.traineeName);
  }

  const pending: PendingRow[] = [
    ...queuedMarks.map((record) => ({
      key: record.key,
      traineeId: traineeIdFromOutboxKey(record.key),
      traineeName: record.traineeName,
      kind: 'marks' as const,
      instrumentLabel: record.instrumentLabel,
      queuedAt: record.queuedAt,
      attempts: record.attempts,
      lastError: record.lastError,
    })),
    ...queuedReports.map((record) => ({
      key: record.key,
      traineeId: record.key,
      traineeName: record.traineeName,
      kind: 'report' as const,
      queuedAt: record.queuedAt,
      attempts: record.attempts,
      lastError: record.lastError,
    })),
  ].sort((a, b) => a.queuedAt - b.queuedAt);

  const pendingTraineeIds = new Set(pending.map((row) => row.traineeId));

  // Oldest first: a report held back for a week is the one most likely to have
  // been forgotten, so it belongs at the top of the list.
  const drafted: DraftedRow[] = drafts
    .filter((draft) => !pendingTraineeIds.has(draft.key))
    .map((draft) => ({
      traineeId: draft.key,
      traineeName: draft.traineeName,
      savedAt: draft.savedAt,
      ...(draft.note ? { note: draft.note } : {}),
    }))
    .sort((a, b) => a.savedAt - b.savedAt);

  const draftedTraineeIds = new Set(drafted.map((row) => row.traineeId));

  /**
   * When the report went, from BOTH sources, server first.
   *
   * `rows.reports` is the server's own row, replicated down — it is the
   * authority and it survives a reinstall. The receipt in `sentReports` covers
   * the window between pressing send and the next full sync, which is exactly
   * when the supervisor is looking at this screen. Taking the server's
   * timestamp when both exist keeps the list agreeing with the report itself.
   */
  const sentAtById = new Map<string, number>();
  for (const receipt of sentReports) sentAtById.set(receipt.key, receipt.sentAt);
  for (const report of rows.reports) {
    const at = Date.parse(report.generatedAt);
    if (!Number.isNaN(at)) sentAtById.set(report.traineeId, at);
  }

  const marksCompleteIds = new Set(
    trainees
      .filter((t) => t.requiredCount > 0 && t.ownSubmittedCount >= t.requiredCount)
      .map((t) => t.id),
  );

  const submitted: SubmittedRow[] = [...new Set([...sentAtById.keys(), ...marksCompleteIds])]
    .filter((id) => !pendingTraineeIds.has(id) && !draftedTraineeIds.has(id))
    .map((id) => ({
      traineeId: id,
      traineeName: nameById.get(id) ?? 'This trainee',
      sentAt: sentAtById.get(id) ?? null,
      marksComplete: marksCompleteIds.has(id),
    }))
    // Most recently sent first — the one just finished is the one being looked
    // for. Trainees whose report has not been sent sort after, by name.
    .sort((a, b) => {
      if (a.sentAt !== null && b.sentAt !== null) return b.sentAt - a.sentAt;
      if (a.sentAt !== null) return -1;
      if (b.sentAt !== null) return 1;
      return a.traineeName.localeCompare(b.traineeName);
    });

  return { drafted, submitted, pending };
}

/**
 * The number the bottom-nav badge carries.
 *
 * Only work that is still waiting counts — held drafts and queued items. A
 * submitted assessment is finished, and a badge that counted it would climb
 * all week and stop meaning anything.
 */
export function waitingCount(view: ReportsView): number {
  return view.drafted.length + view.pending.length;
}
