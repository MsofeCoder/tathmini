import { describe, expect, it } from 'vitest';
import {
  markTargetFromPath,
  resolveMarkTarget,
  resolveTraineeId,
  traineeIdFromPath,
} from './route-params';

/**
 * The regression these guard is not subtle: reading the id from the query
 * string instead of the path made EVERY trainee report "not on your route",
 * for every supervisor, one tap after they had picked that trainee off their
 * own route list. The url is `/trainee/<id>`; the `?id=` lives only in the
 * rewrite's destination, which the browser never sees.
 */
describe('traineeIdFromPath', () => {
  it('reads the id a supervisor actually has in the address bar', () => {
    expect(traineeIdFromPath('/trainee/9f3c1e2a-0000-4000-8000-abcdefabcdef')).toBe(
      '9f3c1e2a-0000-4000-8000-abcdefabcdef',
    );
  });

  it('tolerates a trailing slash', () => {
    expect(traineeIdFromPath('/trainee/t1/')).toBe('t1');
  });

  it('decodes an escaped segment', () => {
    expect(traineeIdFromPath('/trainee/a%2Fb')).toBe('a/b');
  });

  it('does not mistake the rewrite target itself for an id', () => {
    expect(traineeIdFromPath('/trainee')).toBeNull();
    expect(traineeIdFromPath('/trainee/')).toBeNull();
  });

  // Otherwise the profile would try to render for a marking url.
  it('does not match a deeper path', () => {
    expect(traineeIdFromPath('/trainee/t1/mark/tp_theory')).toBeNull();
  });

  it('ignores unrelated paths', () => {
    expect(traineeIdFromPath('/home')).toBeNull();
  });
});

describe('markTargetFromPath', () => {
  it('reads both halves of the marking url', () => {
    expect(markTargetFromPath('/trainee/t1/mark/tp_practical')).toEqual({
      traineeId: 't1',
      instrumentCode: 'tp_practical',
    });
  });

  it('tolerates a trailing slash', () => {
    expect(markTargetFromPath('/trainee/t1/mark/ipt/')).toEqual({
      traineeId: 't1',
      instrumentCode: 'ipt',
    });
  });

  it('returns null for a profile url', () => {
    expect(markTargetFromPath('/trainee/t1')).toBeNull();
  });
});

describe('resolveTraineeId', () => {
  it('prefers the path, which is what the browser actually has', () => {
    const search = new URLSearchParams('id=from-query');
    expect(resolveTraineeId('/trainee/from-path', search)).toBe('from-path');
  });

  // A direct visit to the rewrite target, which is what a link built from the
  // destination rather than the source produces.
  it('falls back to the query string on the rewrite target', () => {
    expect(resolveTraineeId('/trainee', new URLSearchParams('id=t7'))).toBe('t7');
  });

  it('is an empty string when there is nothing to read', () => {
    expect(resolveTraineeId('/trainee', new URLSearchParams())).toBe('');
    expect(resolveTraineeId('/trainee', null)).toBe('');
  });
});

describe('resolveMarkTarget', () => {
  it('prefers the path', () => {
    const search = new URLSearchParams('trainee=q1&instrument=ipt');
    expect(resolveMarkTarget('/trainee/p1/mark/tp_theory', search)).toEqual({
      traineeId: 'p1',
      instrumentCode: 'tp_theory',
    });
  });

  it('falls back to the query string on the rewrite target', () => {
    expect(resolveMarkTarget('/mark', new URLSearchParams('trainee=t2&instrument=ipt'))).toEqual({
      traineeId: 't2',
      instrumentCode: 'ipt',
    });
  });

  it('is empty when there is nothing to read', () => {
    expect(resolveMarkTarget('/mark', null)).toEqual({ traineeId: '', instrumentCode: '' });
  });
});
