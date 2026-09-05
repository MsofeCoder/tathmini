/**
 * When the "Send report" control may appear. Pure and Dexie-free on purpose:
 * this is the rule that decides whether a supervisor is offered the one
 * irreversible action on the screen, so it is unit-tested rather than
 * inferred from a component.
 */

/**
 * Whether this assessor has finished everything their track requires, and so
 * may send the report.
 *
 * A queued instrument counts as finished. It is marked, complete and safe on
 * the device; the only thing missing is a connection, and that is the same
 * thing the report itself is waiting for. Refusing to accept the instruction
 * until the marks have drained would mean a supervisor in a dead zone must
 * come back to this screen later — which is the whole problem being solved.
 *
 * The server is still the authority: `generateReport` re-checks that every
 * instrument in the track carries a submitted mark, and migration 0015's
 * insert policy enforces it in Postgres regardless of what this returns.
 */
export function readyToSendReport({
  instrumentIds,
  submittedInstrumentIds,
  queuedInstrumentIds,
}: {
  instrumentIds: readonly string[];
  submittedInstrumentIds: readonly string[];
  queuedInstrumentIds: readonly string[];
}): boolean {
  if (instrumentIds.length === 0) return false;
  const done = new Set([...submittedInstrumentIds, ...queuedInstrumentIds]);
  return instrumentIds.every((id) => done.has(id));
}
