/**
 * The outcome of a manual send pass, and how it is worded.
 *
 * Split from `send-pending.ts` for the same reason `outbox-drain.ts` is split
 * from the component that used to call it: everything here is pure, so nothing
 * pulls Dexie or a Server Action into a test process, and the sentence a
 * supervisor actually reads can be asserted.
 *
 * That wording is load-bearing now in a way it was not while a background
 * drainer existed. Nothing on the phone sends itself any more, so this is the
 * ONLY thing that tells a supervisor whether their marks reached the College
 * or are still in their pocket.
 */
export type SendPendingResult =
  { kind: 'offline' } | { kind: 'busy' } | { kind: 'done'; submitted: number; sent: number };

export function describeSendResult(result: SendPendingResult, waiting: number): string {
  if (result.kind === 'offline') {
    return 'Still no connection. Nothing was sent, and nothing has been lost — try again when you have signal.';
  }
  if (result.kind === 'busy') return 'Already sending. Give it a moment.';

  const moved = result.submitted + result.sent;
  if (moved === 0) {
    return 'Nothing could be sent this time. Everything is still saved on this phone — try again in a moment.';
  }

  const parts: string[] = [];
  if (result.submitted > 0) {
    parts.push(`${result.submitted} ${result.submitted === 1 ? 'assessment' : 'assessments'}`);
  }
  if (result.sent > 0) parts.push(`${result.sent} ${result.sent === 1 ? 'report' : 'reports'}`);

  // Never a negative remainder: an item can be queued while the pass is
  // running, so `moved` can legitimately exceed what the screen counted.
  const remaining = Math.max(0, waiting - moved);
  return remaining > 0
    ? `Sent ${parts.join(' and ')}. ${remaining} still waiting — tap Send again.`
    : `Sent ${parts.join(' and ')}. Nothing is waiting on this phone.`;
}
