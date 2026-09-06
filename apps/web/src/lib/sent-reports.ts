import { db, type SentReportRecord } from './db';

/**
 * Receipts for reports that have actually left this phone.
 *
 * The Reports tab's three lists have to be readable with no signal — the whole
 * reason a supervisor opens it is usually that something did not send — so
 * "Submitted" cannot be a server query. The send path writes here the moment
 * the server confirms, both on the online path (ReportDownloadButton) and when
 * a queued report finally drains, and the tab reads it back from IndexedDB.
 *
 * A receipt is a note to the supervisor and nothing else. No mark, total,
 * grade or verdict is ever derived from it — those are computed in Postgres
 * (AGENTS.md rule 3) — and losing one loses nothing but a line in a list.
 */

export interface RecordSentReportInput {
  traineeId: string;
  traineeName: string;
  /** Defaults to now; injectable so the drain pass can be tested. */
  sentAt?: number;
}

export async function recordSentReport({
  traineeId,
  traineeName,
  sentAt,
}: RecordSentReportInput): Promise<void> {
  await db.sentReports.put({
    key: traineeId,
    traineeName,
    sentAt: sentAt ?? Date.now(),
  });
}

export async function listSentReports(): Promise<SentReportRecord[]> {
  return db.sentReports.toArray();
}
