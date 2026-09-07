import { describe, expect, it, vi } from 'vitest';
import { drainOutbox, type DrainDeps } from './outbox-drain';
import type { OutboxRecord } from './db';
import type { SubmitAssessmentInput, SubmitAssessmentResult } from './submission';

const payload = { traineeId: 't1', instrumentId: 'i1' } as unknown as SubmitAssessmentInput;

function record(key: string): OutboxRecord {
  return {
    key,
    payload,
    traineeName: 'Asha Juma',
    instrumentLabel: 'TP Theory',
    queuedAt: 0,
    attempts: 0,
    lastError: null,
  };
}

/**
 * A fake queue that behaves like the real one: an entry removed by a pass is
 * gone from the next `listDue()`. Without that, "drain twice" would prove
 * nothing — the second pass would re-read an entry the first had already
 * cleared, which is not what happens on a device.
 */
function harness(options: {
  queued?: string[];
  reports?: string[];
  submit?: (payload: SubmitAssessmentInput) => Promise<SubmitAssessmentResult>;
  generateReport?: (traineeId: string) => Promise<{ error: string } | { url: string }>;
}) {
  const queue = new Map((options.queued ?? []).map((key) => [key, record(key)]));
  const reports = new Set(options.reports ?? []);
  const order: string[] = [];
  const clearedDrafts: string[] = [];
  const attempts: { key: string; error: string }[] = [];
  const receipts: { traineeId: string; traineeName: string }[] = [];

  const deps: DrainDeps = {
    listDue: async () => [...queue.values()],
    submit: vi.fn(async (input: SubmitAssessmentInput) => {
      order.push('submit');
      return (await options.submit?.(input)) ?? ({ ok: true } satisfies SubmitAssessmentResult);
    }),
    removeQueued: async (key) => void queue.delete(key),
    recordAttempt: async (key, error) => void attempts.push({ key, error }),
    clearDraft: async (key) => void clearedDrafts.push(key),

    listQueuedReports: async () =>
      [...reports].map((key) => ({
        key,
        traineeName: 'Asha Juma',
        queuedAt: 0,
        attempts: 0,
        lastError: null,
      })),
    generateReport: vi.fn(async (traineeId: string) => {
      order.push('report');
      return (await options.generateReport?.(traineeId)) ?? { url: 'https://signed' };
    }),
    removeQueuedReport: async (key) => void reports.delete(key),
    recordReportAttempt: async (key, error) => void attempts.push({ key, error }),
    recordSentReport: async (input) => void receipts.push(input),
  };

  return { deps, queue, reports, order, clearedDrafts, attempts, receipts };
}

/**
 * The on-device receipt that the Reports screen's Submitted list is built
 * from. It is bookkeeping — nothing is decided from it — but a report that
 * went and is not listed as gone is one a supervisor will try to send again.
 */
describe('drainOutbox — the sent receipt', () => {
  it('writes a receipt for a report that actually went', async () => {
    const h = harness({ reports: ['t1'] });
    await drainOutbox(h.deps);
    expect(h.receipts).toEqual([{ traineeId: 't1', traineeName: 'Asha Juma' }]);
  });

  it('writes no receipt when the send failed', async () => {
    const h = harness({
      reports: ['t1'],
      generateReport: async () => {
        throw new Error('offline');
      },
    });
    await drainOutbox(h.deps);
    expect(h.receipts).toEqual([]);
    // and the report is still queued, so nothing was lost
    expect(h.reports.has('t1')).toBe(true);
  });

  it('writes one receipt however many times connectivity returns', async () => {
    const h = harness({ reports: ['t1'] });
    await drainOutbox(h.deps);
    await drainOutbox(h.deps);
    await drainOutbox(h.deps);
    expect(h.receipts).toHaveLength(1);
  });
});

/**
 * ROADMAP.md Phase 1 exit gate: "reconnecting produces exactly one submission,
 * never two." Every test in this block exists to hold that line.
 */
describe('drainOutbox — exactly one submission', () => {
  it('submits a queued assessment once, however many times connectivity returns', async () => {
    const h = harness({ queued: ['t1:i1'] });

    // Three reconnects, as a flapping signal in a workshop produces.
    await drainOutbox(h.deps);
    await drainOutbox(h.deps);
    await drainOutbox(h.deps);

    expect(h.deps.submit).toHaveBeenCalledTimes(1);
    expect(h.queue.size).toBe(0);
  });

  it('treats already_submitted as done — the first attempt did land', async () => {
    // The response was lost, not the submission. Re-sending here is exactly
    // the double submission the gate forbids.
    const h = harness({
      queued: ['t1:i1'],
      submit: async () => ({
        ok: false,
        code: 'already_submitted',
        error: 'This assessment has already been submitted.',
      }),
    });

    const result = await drainOutbox(h.deps);

    expect(result.submitted).toBe(1);
    expect(h.queue.size).toBe(0);
    expect(h.clearedDrafts).toEqual(['t1:i1']);
  });

  it('never clears the draft until the server has confirmed', async () => {
    const h = harness({
      queued: ['t1:i1'],
      submit: async () => ({ ok: false, code: 'server', error: 'boom' }),
    });

    await drainOutbox(h.deps);

    // The marks stay on the device. Losing them is unrecoverable in the field.
    expect(h.clearedDrafts).toEqual([]);
    expect(h.queue.size).toBe(1);
    expect(h.attempts).toEqual([{ key: 't1:i1', error: 'boom' }]);
  });

  it('abandons the pass when the connection is still dead, keeping everything', async () => {
    const h = harness({
      queued: ['t1:i1', 't2:i1', 't3:i1'],
      submit: async () => {
        throw new Error('network');
      },
    });

    await drainOutbox(h.deps);

    // Breaks on the first failure rather than burning an attempt on all three.
    expect(h.deps.submit).toHaveBeenCalledTimes(1);
    expect(h.queue.size).toBe(3);
    expect(h.attempts).toEqual([]);
  });

  it('drains every due entry when the connection holds', async () => {
    const h = harness({ queued: ['t1:i1', 't2:i1', 't3:i1'] });

    const result = await drainOutbox(h.deps);

    expect(result.submitted).toBe(3);
    expect(h.queue.size).toBe(0);
    expect(h.clearedDrafts).toEqual(['t1:i1', 't2:i1', 't3:i1']);
  });
});

describe('drainOutbox — reports', () => {
  it('sends reports only after the marks they are built from', async () => {
    const h = harness({ queued: ['t1:i1'], reports: ['t1'] });

    await drainOutbox(h.deps);

    // The other order fails every attempt with "submit your assessment first".
    expect(h.order).toEqual(['submit', 'report']);
  });

  it('does not re-queue a report once it is stored', async () => {
    const h = harness({ reports: ['t1'] });

    const result = await drainOutbox(h.deps);

    // Re-generating would store a second copy of an append-only document.
    expect(result.sent).toBe(1);
    expect(h.reports.size).toBe(0);
  });

  it('keeps a report queued when the server refuses it', async () => {
    const h = harness({
      reports: ['t1'],
      generateReport: async () => ({ error: 'Submit your assessment first.' }),
    });

    const result = await drainOutbox(h.deps);

    expect(result.sent).toBe(0);
    expect(h.reports.size).toBe(1);
    expect(h.attempts).toEqual([{ key: 't1', error: 'Submit your assessment first.' }]);
  });

  it('sends a queued report exactly once across repeated reconnects', async () => {
    const h = harness({ reports: ['t1'] });

    await drainOutbox(h.deps);
    await drainOutbox(h.deps);

    expect(h.deps.generateReport).toHaveBeenCalledTimes(1);
  });
});
