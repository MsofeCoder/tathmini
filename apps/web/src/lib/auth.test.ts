import { describe, expect, it } from 'vitest';
import { usernameToEmail } from './auth';

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
