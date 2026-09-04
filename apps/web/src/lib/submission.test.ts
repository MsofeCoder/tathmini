import { describe, expect, it } from 'vitest';
import { drainOutcomeFor } from './submission';

describe('drainOutcomeFor', () => {
  it('clears a successful submission from the outbox', () => {
    expect(drainOutcomeFor({ ok: true })).toBe('submitted');
  });

  it('treats already_submitted as done, not as a failure to retry', () => {
    // The idempotency case: the first attempt reached the database but its
    // response was lost. Retrying forever would never succeed, and marks are
    // append-only, so this must clear the queue.
    expect(
      drainOutcomeFor({ ok: false, code: 'already_submitted', error: 'already submitted' }),
    ).toBe('submitted');
  });

  it('keeps everything else queued rather than dropping a supervisor’s marks', () => {
    for (const code of ['signed_out', 'server', 'incomplete', 'invalid'] as const) {
      expect(drainOutcomeFor({ ok: false, code, error: 'nope' })).toBe('retry');
    }
  });
});
