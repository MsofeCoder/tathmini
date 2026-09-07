import { describe, expect, it } from 'vitest';
import { describeSendResult } from './send-pending-result';

/**
 * What the supervisor is told after tapping Send.
 *
 * This wording is load-bearing now, in a way it was not while a background
 * drainer existed. Nothing on the phone sends itself any more, so the sentence
 * after a send pass is the ONLY thing that tells a supervisor whether their
 * marks reached the College or are still sitting in their pocket. "Sent" when
 * some are still queued would end the route walk with work stranded on a
 * device nobody will look at again.
 */
describe('describeSendResult', () => {
  it('never claims anything was sent when the connection was not there', () => {
    const message = describeSendResult({ kind: 'offline' }, 3);
    expect(message).toContain('nothing has been lost');
    expect(message).not.toMatch(/\bSent\b/);
  });

  it('says nothing went when the pass moved nothing, without implying loss', () => {
    const message = describeSendResult({ kind: 'done', submitted: 0, sent: 0 }, 2);
    expect(message).toContain('still saved on this phone');
  });

  it('counts marks and reports separately — they fail for different reasons', () => {
    expect(describeSendResult({ kind: 'done', submitted: 2, sent: 1 }, 3)).toBe(
      'Sent 2 assessments and 1 report. Nothing is waiting on this phone.',
    );
  });

  it('singularises, so one assessment does not read as a batch', () => {
    expect(describeSendResult({ kind: 'done', submitted: 1, sent: 0 }, 1)).toBe(
      'Sent 1 assessment. Nothing is waiting on this phone.',
    );
  });

  // The case that matters most: a partial pass must ask for another tap rather
  // than let the supervisor walk away.
  it('says how much is still waiting and asks for another tap', () => {
    expect(describeSendResult({ kind: 'done', submitted: 1, sent: 0 }, 4)).toBe(
      'Sent 1 assessment. 3 still waiting — tap Send again.',
    );
  });

  it('never reports a negative remainder if the queue grew mid-pass', () => {
    expect(describeSendResult({ kind: 'done', submitted: 3, sent: 2 }, 1)).toContain(
      'Nothing is waiting',
    );
  });

  it('does not pretend a second tap started a second pass', () => {
    expect(describeSendResult({ kind: 'busy' }, 2)).toContain('Already sending');
  });
});
