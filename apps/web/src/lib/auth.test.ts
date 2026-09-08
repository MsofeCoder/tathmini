import { describe, expect, it } from 'vitest';
import { landingPathForRole, usernameToEmail } from './auth';

describe('usernameToEmail', () => {
  it('appends the synthetic internal domain', () => {
    expect(usernameToEmail('evodius.kadason')).toBe('evodius.kadason@tathmini.internal');
  });

  it('trims whitespace', () => {
    expect(usernameToEmail('  msofe.coder  ')).toBe('msofe.coder@tathmini.internal');
  });

  it('lowercases, so the field is not case-sensitive to the person typing it', () => {
    expect(usernameToEmail('Aron.Franco')).toBe('aron.franco@tathmini.internal');
  });
});

describe('landingPathForRole', () => {
  it('sends a supervisor to their route list', () => {
    expect(landingPathForRole('supervisor')).toBe('/home');
  });

  it('sends a coordinator to the oversight dashboard, not the field app', () => {
    expect(landingPathForRole('coordinator')).toBe('/coordinator');
  });

  it('sends a super_admin to the console', () => {
    expect(landingPathForRole('super_admin')).toBe('/admin');
  });

  // The forced first password change reads the role after writing the
  // password; a row it cannot read must not strand anyone on /admin.
  it('falls back to /home when the role is unknown or absent', () => {
    expect(landingPathForRole(null)).toBe('/home');
    expect(landingPathForRole(undefined)).toBe('/home');
    expect(landingPathForRole('something_new')).toBe('/home');
  });
});
