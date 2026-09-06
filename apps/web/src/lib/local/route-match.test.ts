import { describe, expect, it } from 'vitest';
import { isInternalNavigation, isShellPath, matchScreen } from './route-match';

/**
 * The routing table of the field app. With one precached document answering
 * every navigation, this function is the only thing that decides what a
 * supervisor sees — so it is asserted rather than read once in a component.
 */
describe('matchScreen', () => {
  it('routes the top-level screens', () => {
    expect(matchScreen('/')).toEqual({ name: 'install' });
    expect(matchScreen('/home')).toEqual({ name: 'home' });
    expect(matchScreen('/pending')).toEqual({ name: 'pending' });
    expect(matchScreen('/account')).toEqual({ name: 'account' });
  });

  it('reads the trainee id straight out of the path', () => {
    expect(matchScreen('/trainee/9f3c1e2a-0000-4000-8000-abcdefabcdef')).toEqual({
      name: 'trainee',
      traineeId: '9f3c1e2a-0000-4000-8000-abcdefabcdef',
    });
  });

  // The marking pattern also starts /trainee/, so order matters.
  it('routes marking, not the profile, for a marking url', () => {
    expect(matchScreen('/trainee/t1/mark/tp_practical')).toEqual({
      name: 'mark',
      traineeId: 't1',
      instrumentCode: 'tp_practical',
    });
  });

  it('treats a trailing slash as the same screen', () => {
    expect(matchScreen('/home/')).toEqual({ name: 'home' });
    expect(matchScreen('/trainee/t1/')).toEqual({ name: 'trainee', traineeId: 't1' });
    expect(matchScreen('/trainee/t1/mark/ipt/')).toEqual({
      name: 'mark',
      traineeId: 't1',
      instrumentCode: 'ipt',
    });
  });

  it('decodes an escaped segment', () => {
    expect(matchScreen('/trainee/a%20b')).toEqual({ name: 'trainee', traineeId: 'a b' });
  });

  it('does not treat /trainee alone as a profile', () => {
    expect(matchScreen('/trainee')).toEqual({ name: 'not-found' });
    expect(matchScreen('/trainee/')).toEqual({ name: 'not-found' });
  });

  it('does not swallow deeper trainee paths', () => {
    // The report preview is a real server route and must reach the network.
    expect(matchScreen('/trainee/t1/report/preview')).toEqual({ name: 'not-found' });
  });

  it('is not confused by unknown paths', () => {
    expect(matchScreen('/nope')).toEqual({ name: 'not-found' });
    expect(matchScreen('/login')).toEqual({ name: 'not-found' });
  });
});

describe('isShellPath', () => {
  it.each(['/', '/home', '/pending', '/account', '/trainee/t1', '/trainee/t1/mark/ipt', '/moves'])(
    'claims %s for the shell',
    (path) => {
      expect(isShellPath(path)).toBe(true);
    },
  );

  // These must reach the server: sign-in needs the network, the API is
  // NetworkOnly, and the report preview is rendered by the server.
  it.each(['/login', '/change-password', '/api/sync', '/trainee/t1/report/preview'])(
    'leaves %s to the server',
    (path) => {
      expect(isShellPath(path)).toBe(false);
    },
  );
});

describe('isInternalNavigation', () => {
  const origin = 'https://tathmini.example';

  it('handles an in-app link itself', () => {
    expect(isInternalNavigation(new URL('/trainee/t1', origin), origin)).toBe(true);
  });

  // A signed report url points at Supabase Storage.
  it('leaves another origin to the browser', () => {
    expect(isInternalNavigation(new URL('https://elsewhere.example/file.pdf'), origin)).toBe(false);
  });

  it('leaves a same-origin server route to the browser', () => {
    expect(isInternalNavigation(new URL('/login', origin), origin)).toBe(false);
  });
});
