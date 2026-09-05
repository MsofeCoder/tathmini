import { describe, expect, it } from 'vitest';
import { readyToSendReport } from './report-readiness';

const TP = ['tp-theory', 'tp-practical'];
const IPT = ['ipt'];

describe('readyToSendReport', () => {
  describe('IPT — one instrument, which is why this matters most', () => {
    it('is ready once the single instrument is submitted', () => {
      expect(
        readyToSendReport({
          instrumentIds: IPT,
          submittedInstrumentIds: ['ipt'],
          queuedInstrumentIds: [],
        }),
      ).toBe(true);
    });

    it('is ready when the single instrument is only queued on the device', () => {
      // The marks are complete and safe; they are waiting for the same signal
      // the report is waiting for. Refusing here would strand the supervisor.
      expect(
        readyToSendReport({
          instrumentIds: IPT,
          submittedInstrumentIds: [],
          queuedInstrumentIds: ['ipt'],
        }),
      ).toBe(true);
    });

    it('is not ready before the assessment is marked', () => {
      expect(
        readyToSendReport({
          instrumentIds: IPT,
          submittedInstrumentIds: [],
          queuedInstrumentIds: [],
        }),
      ).toBe(false);
    });
  });

  describe('TP — both halves required', () => {
    it('accepts one submitted and one queued', () => {
      expect(
        readyToSendReport({
          instrumentIds: TP,
          submittedInstrumentIds: ['tp-theory'],
          queuedInstrumentIds: ['tp-practical'],
        }),
      ).toBe(true);
    });

    it('refuses when only one half is done', () => {
      // A TP report missing its Practical half is not a VETA document, and a
      // stored report cannot be replaced.
      expect(
        readyToSendReport({
          instrumentIds: TP,
          submittedInstrumentIds: ['tp-theory'],
          queuedInstrumentIds: [],
        }),
      ).toBe(false);
    });

    it('ignores instruments that do not belong to this track', () => {
      expect(
        readyToSendReport({
          instrumentIds: TP,
          submittedInstrumentIds: ['tp-theory', 'ipt'],
          queuedInstrumentIds: [],
        }),
      ).toBe(false);
    });
  });

  it('is never ready when the track has no instruments — nothing to report on', () => {
    expect(
      readyToSendReport({
        instrumentIds: [],
        submittedInstrumentIds: ['tp-theory'],
        queuedInstrumentIds: [],
      }),
    ).toBe(false);
  });
});
