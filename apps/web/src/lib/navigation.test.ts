import { describe, expect, it } from 'vitest';
import { activeNavHref } from './navigation';

describe('activeNavHref', () => {
  it('lights Reports at the old /pending url', () => {
    // The url still serves the Reports screen for phones that have it
    // precached or bookmarked; the bar must not blink to no-tab-selected.
    expect(activeNavHref('/pending')).toBe('/reports');
  });

  it('keeps a top-level tab on itself', () => {
    expect(activeNavHref('/home')).toBe('/home');
    expect(activeNavHref('/reports')).toBe('/reports');
    expect(activeNavHref('/account')).toBe('/account');
  });

  // A supervisor inside a trainee has not left the Trainees section, and a
  // nav bar that says otherwise invites them to tap "back" to where they
  // already are.
  it('lights Trainees while inside a trainee', () => {
    expect(activeNavHref('/trainee/abc-123')).toBe('/home');
    expect(activeNavHref('/trainee')).toBe('/home');
  });
});
