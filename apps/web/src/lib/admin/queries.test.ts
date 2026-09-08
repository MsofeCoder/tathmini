import { describe, expect, it } from 'vitest';
import { countPendingChangeRequests, groupDuplicates } from './queries';

interface Row {
  id: string;
  email: string | null;
  name: string;
}

const rows: Row[] = [
  { id: '1', email: 'rashidmujwahuzi@gmail.com', name: 'MUDABIRU MUJWAHUZI MUSSSA' },
  { id: '2', email: 'RashidMujwahuzi@Gmail.com ', name: 'BENARD TIAGO RAULENTI' },
  { id: '3', email: 'someone@example.com', name: 'ADENI MWANITU' },
  { id: '4', email: null, name: 'adeni  mwanitu' },
  { id: '5', email: '   ', name: 'HERI AYUBU' },
];

describe('groupDuplicates', () => {
  it('groups addresses that differ only by case or spacing', () => {
    const groups = groupDuplicates(rows, (r) => r.email);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.map((r) => r.id)).toEqual(['1', '2']);
  });

  it('ignores null and blank keys instead of grouping them together', () => {
    const groups = groupDuplicates(rows, (r) => r.email);
    expect(groups.flat().map((r) => r.id)).not.toContain('4');
    expect(groups.flat().map((r) => r.id)).not.toContain('5');
  });

  it('matches names across a double space, which the register really contains', () => {
    const groups = groupDuplicates(rows, (r) => r.name);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.map((r) => r.id)).toEqual(['3', '4']);
  });

  it('returns nothing when every value is unique', () => {
    expect(groupDuplicates(rows.slice(0, 1), (r) => r.email)).toEqual([]);
  });
});

/**
 * Only the failure path is worth a test here, and it is the one that matters:
 * this count runs in the console LAYOUT, so if it threw while migration 0030
 * is unapplied it would take down every administration page — Trainees,
 * Accounts, Backup, all of it — for a feature that is switched off.
 */
describe('countPendingChangeRequests', () => {
  function client(result: { count?: number | null; error?: unknown }) {
    return {
      from: () => ({
        select: () => ({
          eq: () => Promise.resolve({ count: result.count ?? null, error: result.error ?? null }),
        }),
      }),
    } as never;
  }

  it('returns the count of pending requests', async () => {
    expect(await countPendingChangeRequests(client({ count: 4 }))).toBe(4);
  });

  it('returns 0 when the table does not exist yet, rather than throwing', async () => {
    const missingTable = { code: '42P01', message: 'relation "trainee_change_requests" ...' };
    expect(await countPendingChangeRequests(client({ error: missingTable }))).toBe(0);
  });

  it('returns 0 when the count comes back null', async () => {
    expect(await countPendingChangeRequests(client({ count: null }))).toBe(0);
  });
});
