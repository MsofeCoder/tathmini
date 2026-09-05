import { db, type ReportOutboxRecord } from './db';

/**
 * The offline queue for "send the report", separate from the assessment
 * outbox because the two fail for different reasons and must drain in order.
 *
 * A report cannot be produced on the device: generating it renders the VETA
 * form through headless Chromium on the server and then hands it to SMTP.
 * Offline, the honest thing is not to hide the button — it is to accept the
 * instruction and keep it, exactly as the marks themselves are kept, and act
 * on it when there is signal. Without this an IPT supervisor is stuck: an IPT
 * trainee has one instrument, so once it is marked the offline profile has
 * nothing left to offer, and the report can only be sent by finding a
 * connection and navigating to a server-rendered page they have never seen.
 *
 * Keyed by trainee id: one report per trainee per assessor, and re-queueing
 * the same trainee replaces rather than duplicates.
 */

export interface EnqueueReportInput {
  traineeId: string;
  traineeName: string;
}

export async function enqueueReport({ traineeId, traineeName }: EnqueueReportInput): Promise<void> {
  await db.reportOutbox.put({
    key: traineeId,
    traineeName,
    queuedAt: Date.now(),
    attempts: 0,
    lastError: null,
  });
}

export async function listQueuedReports(): Promise<ReportOutboxRecord[]> {
  return db.reportOutbox.toArray();
}

export async function removeQueuedReport(key: string): Promise<void> {
  await db.reportOutbox.delete(key);
}

/** Records a failed attempt without dropping the entry. */
export async function recordReportAttempt(key: string, error: string): Promise<void> {
  const record = await db.reportOutbox.get(key);
  if (!record) return;
  await db.reportOutbox.put({ ...record, attempts: record.attempts + 1, lastError: error });
}

export async function traineeIdsWithQueuedReports(): Promise<Set<string>> {
  return new Set((await db.reportOutbox.toCollection().primaryKeys()) as string[]);
}
