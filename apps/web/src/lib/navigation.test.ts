import { describe, expect, it } from 'vitest';
import { activeNavHref, isProtectedFromRedirect } from './navigation';

/**
 * The automatic online/offline switch is the one piece of the shell that can
 * destroy work, so the guard list is pinned here rather than left for a
 * reviewer to notice.
 */
describe('isProtectedFromRedirect', () => {
  it('never redirects away from a marking screen', () => {
    // Signal flaps constantly in the field. The marking form is
    // client-rendered and keeps working; navigating away would throw away a
    // half-finished assessment.
    expect(isProtectedFromRedirect('/trainee/abc/mark/tp_theory')).toBe(true);
    expect(isProtectedFromRedirect('/trainee/abc/mark/tp_practical')).toBe(true);
    expect(isProtectedFromRedirect('/trainee/abc/mark/ipt')).toBe(true);
  });

  it('never redirects away from a trainee profile', () => {
    expect(isProtectedFromRedirect('/trainee/abc')).toBe(true);
  });

  it('never redirects away from the sign-in screens', () => {
    // A supervisor with no signal cannot sign in anyway, and bouncing them to
    // /offline would hide the reason.
    expect(isProtectedFromRedirect('/login')).toBe(true);
    expect(isProtectedFromRedirect('/change-password')).toBe(true);
    expect(isProtectedFromRedirect('/')).toBe(true);
  });

  it('does not redirect the offline screen to itself', () => {
    expect(isProtectedFromRedirect('/offline')).toBe(true);
  });

  it('does redirect the server-rendered top-level screens', () => {
    // These cannot be produced without a network: middleware.ts validates the
    // session over the wire before the page renders at all.
    expect(isProtectedFromRedirect('/home')).toBe(false);
    expect(isProtectedFromRedirect('/reports')).toBe(false);
    expect(isProtectedFromRedirect('/account')).toBe(false);
  });
});

describe('activeNavHref', () => {
  it('treats the offline screen as the Trainees tab', () => {
    // /offline IS the route list without signal — the nav must not suggest
    // the supervisor has left the section they are standing in.
    expect(activeNavHref('/offline')).toBe('/home');
  });

  it('treats the old Pending URL as the Reports tab', () => {
    // Precached on every phone already running the app. It redirects into
    // Reports, and the bar must not blink to no-tab-selected on the way.
    expect(activeNavHref('/pending')).toBe('/reports');
  });

  it('leaves the other tabs alone', () => {
    expect(activeNavHref('/home')).toBe('/home');
    expect(activeNavHref('/reports')).toBe('/reports');
    expect(activeNavHref('/account')).toBe('/account');
  });
});
