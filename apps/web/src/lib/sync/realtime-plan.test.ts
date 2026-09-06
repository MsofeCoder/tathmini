import { describe, expect, it } from 'vitest';
import { planLocalWrite, SUBSCRIBED_TABLES } from './realtime-plan';

/**
 * What a Realtime change does to the device.
 *
 * These assertions are each a way a supervisor's phone could quietly disagree
 * with the College's database — the failure mode of a local-first app, and
 * the one nobody notices until somebody drives to the wrong village.
 */
describe('planLocalWrite', () => {
  it('writes an inserted trainee into the local table', () => {
    const plan = planLocalWrite({
      table: 'trainees',
      eventType: 'INSERT',
      new: { id: 't1', name: 'AMINA JUMA', track: 'TP', section_max: null },
    });
    expect(plan).toMatchObject({ kind: 'put', table: 'trainees' });
  });

  it('converts numerics on the way in, so a criterion max is a number', () => {
    // Postgres numeric arrives as a STRING over both transports. Left alone,
    // `total + itemMax` produces "4550" and a section subtotal compares
    // lexicographically against its maximum.
    const plan = planLocalWrite({
      table: 'criteria',
      eventType: 'UPDATE',
      new: { id: 'c1', instrument_id: 'i1', section_max: '50', item_max: '5', order_index: '3' },
    });
    expect(plan).toMatchObject({
      kind: 'put',
      row: { sectionMax: 50, itemMax: 5, orderIndex: 3 },
    });
  });

  it('keys a mark by trainee and instrument, matching its draft and outbox entry', () => {
    const plan = planLocalWrite({
      table: 'assessment_marks',
      eventType: 'INSERT',
      new: { trainee_id: 't1', instrument_id: 'i1', submitted_at: '2026-09-06T08:00:00Z' },
    });
    expect(plan).toMatchObject({ kind: 'put', table: 'marks', row: { key: 't1:i1' } });
  });

  it('deletes a trainee by id — the device keys them the same way', () => {
    const plan = planLocalWrite({ table: 'trainees', eventType: 'DELETE', old: { id: 't1' } });
    expect(plan).toEqual({ kind: 'delete', table: 'trainees', key: 't1' });
  });

  // The important one. A delete payload carries only the primary key, and for
  // these tables the primary key is a surrogate uuid that matches nothing in
  // IndexedDB — so acting on it would leave the row alive after its own
  // deletion. A trainee moved off a route has to actually disappear.
  it.each(['assignments', 'assessment_marks', 'results'])(
    'asks for a re-sync when %s is deleted, rather than guessing',
    (table) => {
      expect(planLocalWrite({ table, eventType: 'DELETE', old: { id: 'row-uuid' } })).toEqual({
        kind: 'resync',
      });
    },
  );

  it('asks for a re-sync when a delete carries no id at all', () => {
    expect(planLocalWrite({ table: 'trainees', eventType: 'DELETE', old: {} })).toEqual({
      kind: 'resync',
    });
  });

  it('ignores a table the device does not mirror', () => {
    expect(planLocalWrite({ table: 'audit_log', eventType: 'INSERT', new: { id: 'a1' } })).toEqual({
      kind: 'ignore',
    });
  });

  // RLS can filter a change to nothing: the socket says something moved
  // without saying what. Writing a record built from empty strings would put
  // a nameless trainee on somebody's route list.
  it('ignores an insert with an empty row', () => {
    expect(planLocalWrite({ table: 'trainees', eventType: 'INSERT', new: {} })).toEqual({
      kind: 'ignore',
    });
  });

  // Subscribing to a table that is not in the publication is silent — no
  // error, no events — so this list and migration 0028 must agree.
  it('subscribes to exactly the six tables migration 0028 publishes', () => {
    expect([...SUBSCRIBED_TABLES].sort()).toEqual([
      'assessment_marks',
      'assignments',
      'criteria',
      'instruments',
      'results',
      'trainees',
    ]);
  });
});
