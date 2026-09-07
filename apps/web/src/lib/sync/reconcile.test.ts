import { describe, expect, it } from 'vitest';
import { shouldWipeReplicas, staleIds } from './reconcile';

describe('shouldWipeReplicas', () => {
  // Phones are shared between tutors at the College. RLS stops the server
  // ever sending Juma the rows of Fatuma's route; it cannot reach into a
  // database on a phone and remove the ones already there.
  it('wipes when a different supervisor signs in on the same phone', () => {
    expect(shouldWipeReplicas('fatuma', 'juma')).toBe(true);
  });

  it('does not wipe on an ordinary re-sync by the same person', () => {
    expect(shouldWipeReplicas('juma', 'juma')).toBe(false);
  });

  // A first sync, or a device upgraded from the pre-local-first snapshot,
  // which never recorded who it belonged to. Wiping would throw away the
  // route of a supervisor standing in a dead zone, for no gain.
  it.each([undefined, null, ''])('does not wipe when nothing is stored (%s)', (stored) => {
    expect(shouldWipeReplicas(stored, 'juma')).toBe(false);
  });
});

describe('staleIds', () => {
  // A sync that only ever writes is a sync that never forgets: a trainee
  // moved to another route would stay on this phone, and the supervisor
  // would go and assess them.
  it('names local rows the server no longer sends', () => {
    expect(staleIds(['a', 'b', 'c'], ['a', 'c'])).toEqual(['b']);
  });

  it('keeps everything when the payload still has it all', () => {
    expect(staleIds(['a', 'b'], ['b', 'a'])).toEqual([]);
  });

  it('reports every local row when the payload is empty', () => {
    expect(staleIds(['a', 'b'], [])).toEqual(['a', 'b']);
  });

  it('is not confused by ids the device has never seen', () => {
    expect(staleIds(['a'], ['a', 'new'])).toEqual([]);
  });
});
