import { describe, expect, it } from 'vitest';
import { backoffDelayMs, belongsToCurrentUser, isDue } from './outbox';

/** No jitter, so the curve itself can be asserted. */
const noJitter = () => 0.5;

describe('backoffDelayMs', () => {
  it('does not delay a submission that has never failed', () => {
    // A supervisor who finishes a trainee in coverage must see it send now,
    // not in ten seconds.
    expect(backoffDelayMs(0, noJitter)).toBe(0);
  });

  it('doubles from 10 seconds', () => {
    expect(backoffDelayMs(1, noJitter)).toBe(10_000);
    expect(backoffDelayMs(2, noJitter)).toBe(20_000);
    expect(backoffDelayMs(3, noJitter)).toBe(40_000);
    expect(backoffDelayMs(4, noJitter)).toBe(80_000);
  });

  it('caps at five minutes however long it keeps failing', () => {
    // Someone walking back into coverage must never wait a quarter of an
    // hour for their marks to leave the phone.
    expect(backoffDelayMs(10, noJitter)).toBe(300_000);
    expect(backoffDelayMs(50, noJitter)).toBe(300_000);
    expect(backoffDelayMs(1000, noJitter)).toBe(300_000);
  });

  it('jitters by up to 20% either way', () => {
    // Thirty supervisors returning to coverage at the same roadside must not
    // retry in lockstep.
    expect(backoffDelayMs(1, () => 0)).toBe(8_000);
    expect(backoffDelayMs(1, () => 1)).toBe(12_000);
  });

  it('never returns a negative or absurd delay for any jitter value', () => {
    for (const r of [0, 0.25, 0.5, 0.75, 1]) {
      for (const attempts of [1, 3, 7, 20]) {
        const delay = backoffDelayMs(attempts, () => r);
        expect(delay).toBeGreaterThan(0);
        expect(delay).toBeLessThanOrEqual(MAX_WITH_JITTER);
      }
    }
  });
});

/** 5 min + the 20% jitter ceiling. */
const MAX_WITH_JITTER = 300_000 * 1.2;

describe('isDue', () => {
  it('treats a record queued before backoff existed as due immediately', () => {
    // Dexie keeps whatever shape was written; an older record has no
    // nextAttemptAt and must not be stranded in the queue forever.
    expect(isDue({ nextAttemptAt: undefined }, 1_000)).toBe(true);
  });

  it('holds a record back until its delay has elapsed', () => {
    expect(isDue({ nextAttemptAt: 5_000 }, 4_999)).toBe(false);
    expect(isDue({ nextAttemptAt: 5_000 }, 5_000)).toBe(true);
    expect(isDue({ nextAttemptAt: 5_000 }, 9_999)).toBe(true);
  });

  it('sends a freshly queued submission on the very next pass', () => {
    expect(isDue({ nextAttemptAt: 0 }, 1)).toBe(true);
  });
});

describe('belongsToCurrentUser', () => {
  // Phones are shared between tutors. A queued submission carries an assessor
  // slot belonging to one supervisor, so replaying Fatuma's marks under
  // Juma's session cannot succeed — it can only fail against RLS on every
  // pass while the attempt counter climbs, which reads as her work being
  // retried when it is being refused.
  it('sends the signed-in supervisor’s own queued marks', () => {
    expect(belongsToCurrentUser({ userId: 'juma' }, 'juma')).toBe(true);
  });

  it('leaves another supervisor’s queued marks alone until they sign back in', () => {
    expect(belongsToCurrentUser({ userId: 'fatuma' }, 'juma')).toBe(false);
  });

  // Entries queued before ownership was recorded have nobody on them.
  // Stranding those would lose marks a supervisor cannot redo.
  it('still sends an entry queued before owners were recorded', () => {
    expect(belongsToCurrentUser({}, 'juma')).toBe(true);
    expect(belongsToCurrentUser({ userId: undefined }, undefined)).toBe(true);
  });
});
