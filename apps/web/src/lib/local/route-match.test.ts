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
    expect(matchScreen('/reports')).toEqual({ name: 'reports' });
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

  it('serves Reports at the old /pending url', () => {
    // Phones in the field have /pending in their history, their precache and
    // sometimes on their home screen. Renaming the tab must not 404 a url a
    // supervisor has bookmarked.
    expect(matchScreen('/pending')).toEqual({ name: 'reports' });
    expect(matchScreen('/reports')).toEqual({ name: 'reports' });
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
  it.each([
    '/',
    '/home',
    '/reports',
    '/pending',
    '/account',
    '/trainee/t1',
    '/trainee/t1/mark/ipt',
  ])('claims %s for the shell', (path) => {
    expect(isShellPath(path)).toBe(true);
  });

  // These must reach the server: sign-in needs the network, the API is
  // NetworkOnly, the report preview is rendered by the server, and the
  // administration console is server-rendered on purpose.
  //
  // The last two entries are the ones that matter most. sw.ts derives its
  // navigation rule from this function, so a path wrongly claimed here is a
  // path the worker answers with the shell — rendering "Screen not found"
  // over a console that works perfectly. /admin appeared on main in the same
  // morning this was written, and a Coordinator dashboard behind it; the
  // point of asserting unknown paths is that the NEXT one is safe too.
  it.each([
    '/login',
    '/change-password',
    '/api/sync',
    '/trainee/t1/report/preview',
    '/admin',
    '/admin/users',
    '/admin/trainees/1f0c3d5e-0000-4000-8000-000000000000',
    '/admin/maintenance',
    '/coordinator',
    '/coordinator/',
    // Moves lost its tab: the reassignment state machine is still unbuilt,
    // and an inert quarter of the bar reads as broken rather than as coming.
    '/moves',
    '/something-nobody-has-built-yet',
  ])('leaves %s to the server', (path) => {
    expect(isShellPath(path)).toBe(false);
  });
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
