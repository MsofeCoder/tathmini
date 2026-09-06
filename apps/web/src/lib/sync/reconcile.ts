/**
 * The two decisions a sync has to get right, kept free of Dexie so they can
 * be tested without a browser or a fake IndexedDB.
 *
 * Both are about FORGETTING, which is the half of syncing that is easy to
 * leave out and expensive to get wrong: a local-first app that only ever
 * writes will happily show a supervisor a trainee who was moved off their
 * route last week, or another supervisor's route entirely.
 */

/**
 * Whether the replica tables must be cleared before writing this payload.
 *
 * Phones are shared between tutors at the College, and IndexedDB is per
 * origin, not per person — so without this, Juma signs in on Fatuma's phone
 * and finds Fatuma's route sitting there. Not merely untidy: he would see
 * trainees he is not assigned to, with their phone numbers and e-mail
 * addresses, on a screen that looks exactly like his own route list. RLS
 * stops the server ever sending him those rows; it cannot reach into a
 * database on a phone and remove the ones already there. This does.
 *
 * A device with no stored user (a first sync, or one upgraded from the old
 * snapshot, which never recorded one) is NOT wiped: there is nothing to
 * suspect, and wiping would throw away the route of a supervisor standing in
 * a dead zone for no reason.
 */
export function shouldWipeReplicas(
  storedUserId: string | undefined | null,
  incomingUserId: string,
): boolean {
  return !!storedUserId && storedUserId !== incomingUserId;
}

/**
 * Local ids the payload no longer contains — rows to delete.
 *
 * A full sync that only ever writes is a sync that never forgets. A trainee
 * reassigned to another supervisor, or removed from the register, would stay
 * on the phone indefinitely, and the supervisor would go and assess them.
 * (The College really does move trainees between routes, and the September
 * 2026 roster really did carry duplicate entries that were later deleted.)
 */
export function staleIds(localIds: readonly string[], payloadIds: readonly string[]): string[] {
  const keep = new Set(payloadIds);
  return localIds.filter((id) => !keep.has(id));
}
