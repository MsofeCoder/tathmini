import { describe, expect, it } from 'vitest';
import {
  buildReportsView,
  traineeIdFromOutboxKey,
  waitingCount,
  type BuildReportsInput,
} from './reports';
import type { DeviceRows } from './derive';
import type { OutboxRecord, ReportDraftRecord, ReportOutboxRecord, SentReportRecord } from '../db';
import type { SubmitAssessmentInput } from '../submission';

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

/** Two TP instruments, so a TP trainee's `requiredCount` is 2 — the real shape. */
const TP_INSTRUMENTS = [
  { id: 'tp_theory', code: 'TP_THEORY', label: 'TP Theory', track: 'TP' as const, maxTotal: 100 },
  {
    id: 'tp_practical',
    code: 'TP_PRACTICAL',
    label: 'TP Practical',
    track: 'TP' as const,
    maxTotal: 100,
  },
];

/**
 * A device replica holding one trainee with `submittedMarks` of their own
 * marks in. `buildReportsView` reads the same rows every other screen does, so
 * the fixtures have to be rows rather than pre-derived counters.
 */
function device({
  traineeId = 't1',
  name = 'Asha Juma',
  track = 'TP' as 'TP' | 'IPT',
  submittedMarks = 0,
  instruments = TP_INSTRUMENTS,
  reports = [] as { traineeId: string; generatedAt: string }[],
  trainees,
}: {
  traineeId?: string;
  name?: string;
  track?: 'TP' | 'IPT';
  submittedMarks?: number;
  instruments?: typeof TP_INSTRUMENTS;
  reports?: { traineeId: string; generatedAt: string }[];
  trainees?: { id: string; name: string; track: 'TP' | 'IPT'; submittedMarks: number }[];
} = {}): DeviceRows {
  const people = trainees ?? [{ id: traineeId, name, track, submittedMarks }];

  return {
    trainees: people.map((p) => ({
      id: p.id,
      name: p.name,
      occupation: 'Tutor',
      institution: 'MVTTC',
      track: p.track,
      routeId: null,
      registrationNumber: null,
      course: 'VTTC',
      modeOfStudy: null,
      region: null,
      district: null,
      email: null,
      phone: null,
    })),
    assignments: people.map((p) => ({ traineeId: p.id, slot: 'a1' as const })),
    instruments,
    criteria: [],
    marks: people.flatMap((p) =>
      instruments.slice(0, p.submittedMarks).map((i) => ({
        key: `${p.id}:${i.id}`,
        traineeId: p.id,
        instrumentId: i.id,
        submittedAt: '2026-09-06T08:00:00.000Z',
      })),
    ),
    results: [],
    reports,
    session: null,
  };
}

/** An empty device — no trainees at all, for the queue-only cases. */
const EMPTY: DeviceRows = device({ trainees: [] });

function input(over: Partial<BuildReportsInput> = {}): BuildReportsInput {
  return {
    rows: EMPTY,
    drafts: [],
    queuedMarks: [],
    queuedReports: [],
    sentReports: [],
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

describe('buildReportsView', () => {
  it('files a held report under Drafted', () => {
    const { drafted, pending, submitted } = buildReportsView(input({ drafts: [draft('t1')] }));
    expect(drafted).toHaveLength(1);
    expect(drafted[0]?.traineeId).toBe('t1');
    expect(pending).toHaveLength(0);
    expect(submitted).toHaveLength(0);
  });

  it('files queued marks and a queued report under Pending, marks named by instrument', () => {
    const { pending } = buildReportsView(
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
    const { submitted } = buildReportsView(
      input({ sentReports: [sent('t1', 1_000, 'Asha'), sent('t2', 5_000, 'Baraka')] }),
    );
    expect(submitted.map((row) => row.traineeId)).toEqual(['t2', 't1']);
  });

  it('counts a trainee whose own marks are all in as Submitted, with no signal', () => {
    // The device replica is the only thing readable offline that knows the
    // server has the marks. Without it the Submitted tab would be empty for
    // every trainee marked before report-sending existed.
    const { submitted } = buildReportsView(input({ rows: device({ submittedMarks: 2 }) }));
    expect(submitted).toEqual([
      { traineeId: 't1', traineeName: 'Asha Juma', sentAt: null, marksComplete: true },
    ]);
  });

  it('does not call a half-marked trainee Submitted', () => {
    const { submitted } = buildReportsView(input({ rows: device({ submittedMarks: 1 }) }));
    expect(submitted).toHaveLength(0);
  });

  it('never treats a trainee with no instruments as Submitted', () => {
    // requiredCount 0 would otherwise satisfy `>=` and file an unassessable
    // trainee as done. An IPT trainee on a device holding only TP instruments
    // is exactly that case, and it happens mid-sync.
    const { submitted } = buildReportsView(input({ rows: device({ track: 'IPT' }) }));
    expect(submitted).toHaveLength(0);
  });

  it("takes the server's own report row as the sent time when it has synced down", () => {
    // `reports` is replicated like any other server table and is the
    // authority; the on-device receipt only covers the gap before it arrives.
    const { submitted } = buildReportsView(
      input({
        rows: device({ reports: [{ traineeId: 't1', generatedAt: '2026-09-06T10:00:00.000Z' }] }),
        sentReports: [sent('t1', 1_000)],
      }),
    );
    expect(submitted[0]?.sentAt).toBe(Date.parse('2026-09-06T10:00:00.000Z'));
  });

  it('still lists a report sent seconds ago, before the server row has synced', () => {
    const { submitted } = buildReportsView(input({ sentReports: [sent('t1', 4_000)] }));
    expect(submitted).toEqual([
      { traineeId: 't1', traineeName: 'Asha Juma', sentAt: 4_000, marksComplete: false },
    ]);
  });

  it('ignores an unparseable server timestamp rather than sorting on NaN', () => {
    const { submitted } = buildReportsView(
      input({
        rows: device({ reports: [{ traineeId: 't1', generatedAt: 'not a date' }] }),
        sentReports: [sent('t1', 7_000)],
      }),
    );
    expect(submitted[0]?.sentAt).toBe(7_000);
  });

  it('shows a trainee in exactly one tab — queued beats drafted beats submitted', () => {
    // The state a supervisor must not miss is "still queued": marking that
    // trainee again inserts a permanent duplicate.
    const view = buildReportsView(
      input({
        rows: device({ submittedMarks: 2 }),
        drafts: [draft('t1')],
        queuedMarks: [queuedMark('t1', 'tp_practical')],
        sentReports: [sent('t1', 9_000)],
      }),
    );
    expect(view.pending.map((row) => row.traineeId)).toEqual(['t1']);
    expect(view.drafted).toHaveLength(0);
    expect(view.submitted).toHaveLength(0);
  });

  it('keeps a held draft out of Submitted even when the marks are all in', () => {
    // Nothing sends a draft on its own, and a trainee filed under Submitted is
    // one the supervisor stops thinking about.
    const view = buildReportsView(
      input({ rows: device({ submittedMarks: 2 }), drafts: [draft('t1')] }),
    );
    expect(view.drafted.map((row) => row.traineeId)).toEqual(['t1']);
    expect(view.submitted).toHaveLength(0);
  });

  it('lists both queued instruments for one trainee, oldest first', () => {
    const { pending } = buildReportsView(
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
    const { drafted } = buildReportsView(
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
    const { pending } = buildReportsView(
      input({ queuedMarks: [queuedMark('t1', 'ipt', { attempts: 3, lastError: 'offline' })] }),
    );
    expect(pending[0]?.attempts).toBe(3);
    expect(pending[0]?.lastError).toBe('offline');
  });

  it('names a submitted trainee from whichever record knows the name', () => {
    // The trainee has moved off this route, so the replica no longer has them;
    // the receipt still does.
    const { submitted } = buildReportsView(
      input({ sentReports: [sent('t1', 1_000, 'Neema Kileo')] }),
    );
    expect(submitted[0]?.traineeName).toBe('Neema Kileo');
  });
});

describe('waitingCount', () => {
  it('counts held drafts and queued work, never submitted work', () => {
    const view = buildReportsView(
      input({
        drafts: [draft('t1')],
        queuedMarks: [queuedMark('t2', 'ipt')],
        queuedReports: [queuedReport('t3')],
        sentReports: [sent('t4', 1_000)],
      }),
    );
    expect(waitingCount(view)).toBe(3);
  });

  it('is zero when nothing is waiting', () => {
    expect(waitingCount(buildReportsView(input({ sentReports: [sent('t1', 1_000)] })))).toBe(0);
  });
});
