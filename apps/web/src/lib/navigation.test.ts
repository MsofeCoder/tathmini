import { describe, expect, it } from 'vitest';
import { activeNavHref } from './navigation';

describe('activeNavHref', () => {
  it('keeps a top-level tab on itself', () => {
    expect(activeNavHref('/home')).toBe('/home');
    expect(activeNavHref('/pending')).toBe('/pending');
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
