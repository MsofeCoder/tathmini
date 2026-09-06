import { describe, expect, it } from 'vitest';
import { adminAccess, roleLabel, usernameFromEmail } from './access';

describe('adminAccess', () => {
  it('gives a super admin write access', () => {
    expect(adminAccess({ role: 'super_admin', active: true })).toBe('write');
  });

  it('gives a coordinator read access only', () => {
    expect(adminAccess({ role: 'coordinator', active: true })).toBe('read');
  });

  it('denies a supervisor', () => {
    expect(adminAccess({ role: 'supervisor', active: true })).toBe('deny');
  });

  it('denies a deactivated account whatever its role', () => {
    expect(adminAccess({ role: 'super_admin', active: false })).toBe('deny');
    expect(adminAccess({ role: 'coordinator', active: false })).toBe('deny');
  });

  it('denies an unknown or missing role', () => {
    expect(adminAccess({ role: null, active: true })).toBe('deny');
    expect(adminAccess({ role: undefined, active: true })).toBe('deny');
    expect(adminAccess({ role: 'principal', active: true })).toBe('deny');
  });

  it('treats a missing active flag as active, so a null column cannot lock an admin out', () => {
    expect(adminAccess({ role: 'super_admin', active: null })).toBe('write');
  });
});

describe('roleLabel', () => {
  it('spells out the three roles', () => {
    expect(roleLabel('super_admin')).toBe('Super Administrator');
    expect(roleLabel('coordinator')).toBe('Coordinator');
    expect(roleLabel('supervisor')).toBe('Supervisor');
  });

  it('falls back to the raw value rather than showing nothing', () => {
    expect(roleLabel('registrar')).toBe('registrar');
  });
});

describe('usernameFromEmail', () => {
  it('strips the synthetic domain', () => {
    expect(usernameFromEmail('denis.michael@tathmini.internal')).toBe('denis.michael');
  });

  it('is case-insensitive about the domain', () => {
    expect(usernameFromEmail('aron.franco@TATHMINI.INTERNAL')).toBe('aron.franco');
  });

  it('leaves a real address alone', () => {
    expect(usernameFromEmail('someone@gmail.com')).toBe('someone@gmail.com');
  });
});
