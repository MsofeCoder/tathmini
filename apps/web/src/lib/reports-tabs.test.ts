import { describe, expect, it } from 'vitest';
import {
  classifyReports,
  traineeIdFromOutboxKey,
  waitingCount,
  type ClassifyInput,
} from './reports-tabs';
import type {
  OfflineTrainee,
  OutboxRecord,
  ReportDraftRecord,
  ReportOutboxRecord,
  SentReportRecord,
} from './db';
import type { SubmitAssessmentInput } from './submission';

const payload = {} as unknown as SubmitAssessmentInput;

function queuedMark(
  traineeId: string,
  instrumentId: string,
  over: Partial<OutboxRecord> = {},
): OutboxRecord {
  return {
    key: `${traineeId}:${instrumentId}`,
    payload,
    traineeName: 'Asha Juma',
    instrumentLabel: 'TP Theory',
    queuedAt: 1_000,
    attempts: 0,
    lastError: null,
    ...over,
  };
}

function draft(traineeId: string, over: Partial<ReportDraftRecord> = {}): ReportDraftRecord {
  return { key: traineeId, traineeName: 'Asha Juma', savedAt: 1_000, ...over };
}

function queuedReport(
  traineeId: string,
  over: Partial<ReportOutboxRecord> = {},
): ReportOutboxRecord {
  return {
    key: traineeId,
    traineeName: 'Asha Juma',
    queuedAt: 1_000,
    attempts: 0,
    lastError: null,
    ...over,
  };
}

function sent(traineeId: string, sentAt: number, name = 'Asha Juma'): SentReportRecord {
  return { key: traineeId, traineeName: name, sentAt };
}

function cached(
  id: string,
  ownSubmittedCount: number,
  requiredCount: number,
  name = 'Asha Juma',
): Pick<OfflineTrainee, 'id' | 'name' | 'ownSubmittedCount' | 'requiredCount'> {
  return { id, name, ownSubmittedCount, requiredCount };
}

function input(over: Partial<ClassifyInput> = {}): ClassifyInput {
  return {
    drafts: [],
    queuedMarks: [],
    queuedReports: [],
    sentReports: [],
    cachedTrainees: [],
    ...over,
  };
}

describe('traineeIdFromOutboxKey', () => {
  it('takes the trainee id from a (trainee, instrument) queue key', () => {
    expect(traineeIdFromOutboxKey('t1:tp_theory')).toBe('t1');
  });

  it('splits on the first colon only', () => {
    expect(traineeIdFromOutboxKey('t1:tp:theory')).toBe('t1');
  });

  it('treats an unkeyed value as the trainee id — a report queue key has no colon', () => {
    expect(traineeIdFromOutboxKey('t1')).toBe('t1');
  });
});

describe('classifyReports', () => {
  it('files a held report under Drafted', () => {
    const { drafted, pending, submitted } = classifyReports(input({ drafts: [draft('t1')] }));
    expect(drafted).toHaveLength(1);
    expect(drafted[0]?.traineeId).toBe('t1');
    expect(pending).toHaveLength(0);
    expect(submitted).toHaveLength(0);
  });

  it('files queued marks and a queued report under Pending, marks named by instrument', () => {
    const { pending } = classifyReports(
      input({
        queuedMarks: [queuedMark('t1', 'tp_theory')],
        queuedReports: [queuedReport('t2', { queuedAt: 2_000 })],
      }),
    );
    expect(pending.map((row) => [row.traineeId, row.kind])).toEqual([
      ['t1', 'marks'],
      ['t2', 'report'],
    ]);
    expect(pending[0]?.instrumentLabel).toBe('TP Theory');
    expect(pending[1]?.instrumentLabel).toBeUndefined();
  });

  it('files a sent report under Submitted, most recent first', () => {
    const { submitted } = classifyReports(
      input({ sentReports: [sent('t1', 1_000, 'Asha'), sent('t2', 5_000, 'Baraka')] }),
    );
    expect(submitted.map((row) => row.traineeId)).toEqual(['t2', 't1']);
  });

  it('counts a trainee whose own marks are all in as Submitted, with no signal', () => {
    // The route snapshot is the only thing readable offline that knows the
    // server has the marks. Without it the Submitted tab would be empty for
    // every trainee marked before report-sending existed.
    const { submitted } = classifyReports(input({ cachedTrainees: [cached('t1', 2, 2)] }));
    expect(submitted).toEqual([
      { traineeId: 't1', traineeName: 'Asha Juma', sentAt: null, marksComplete: true },
    ]);
  });

  it('does not call a half-marked trainee Submitted', () => {
    const { submitted } = classifyReports(input({ cachedTrainees: [cached('t1', 1, 2)] }));
    expect(submitted).toHaveLength(0);
  });

  it('never treats a trainee with no instruments as Submitted', () => {
    // requiredCount 0 would otherwise satisfy `>=` and file an unassessable
    // trainee as done.
    const { submitted } = classifyReports(input({ cachedTrainees: [cached('t1', 0, 0)] }));
    expect(submitted).toHaveLength(0);
  });

  it('shows a trainee in exactly one tab — queued beats drafted beats submitted', () => {
    // The state a supervisor must not miss is "still queued": marking that
    // trainee again inserts a permanent duplicate.
    const buckets = classifyReports(
      input({
        drafts: [draft('t1')],
        queuedMarks: [queuedMark('t1', 'tp_practical')],
        sentReports: [sent('t1', 9_000)],
        cachedTrainees: [cached('t1', 2, 2)],
      }),
    );
    expect(buckets.pending.map((row) => row.traineeId)).toEqual(['t1']);
    expect(buckets.drafted).toHaveLength(0);
    expect(buckets.submitted).toHaveLength(0);
  });

  it('keeps a held draft out of Submitted even when the marks are all in', () => {
    // Nothing sends a draft on its own, and a trainee filed under Submitted is
    // one the supervisor stops thinking about.
    const buckets = classifyReports(
      input({ drafts: [draft('t1')], cachedTrainees: [cached('t1', 2, 2)] }),
    );
    expect(buckets.drafted.map((row) => row.traineeId)).toEqual(['t1']);
    expect(buckets.submitted).toHaveLength(0);
  });

  it('lists both queued instruments for one trainee, oldest first', () => {
    const { pending } = classifyReports(
      input({
        queuedMarks: [
          queuedMark('t1', 'tp_practical', { queuedAt: 5_000, instrumentLabel: 'TP Practical' }),
          queuedMark('t1', 'tp_theory', { queuedAt: 1_000 }),
        ],
      }),
    );
    expect(pending.map((row) => row.instrumentLabel)).toEqual(['TP Theory', 'TP Practical']);
  });

  it('puts the oldest held draft at the top', () => {
    const { drafted } = classifyReports(
      input({
        drafts: [
          draft('t2', { savedAt: 9_000, traineeName: 'Baraka' }),
          draft('t1', { savedAt: 1_000, traineeName: 'Asha' }),
        ],
      }),
    );
    expect(drafted.map((row) => row.traineeId)).toEqual(['t1', 't2']);
  });

  it('carries the failed-attempt detail through to Pending', () => {
    const { pending } = classifyReports(
      input({ queuedMarks: [queuedMark('t1', 'ipt', { attempts: 3, lastError: 'offline' })] }),
    );
    expect(pending[0]?.attempts).toBe(3);
    expect(pending[0]?.lastError).toBe('offline');
  });

  it('names a submitted trainee from whichever record knows the name', () => {
    const { submitted } = classifyReports(
      input({ sentReports: [sent('t1', 1_000, 'Neema Kileo')], cachedTrainees: [] }),
    );
    expect(submitted[0]?.traineeName).toBe('Neema Kileo');
  });
});

describe('waitingCount', () => {
  it('counts held drafts and queued work, never submitted work', () => {
    const buckets = classifyReports(
      input({
        drafts: [draft('t1')],
        queuedMarks: [queuedMark('t2', 'ipt')],
        queuedReports: [queuedReport('t3')],
        sentReports: [sent('t4', 1_000)],
      }),
    );
    expect(waitingCount(buckets)).toBe(3);
  });

  it('is zero when nothing is waiting', () => {
    expect(waitingCount(classifyReports(input({ sentReports: [sent('t1', 1_000)] })))).toBe(0);
  });
});
