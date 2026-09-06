import { describe, expect, it } from 'vitest';
import {
  isUuid,
  validateContactEmail,
  validateReason,
  validateTraineeParticulars,
  type TraineeParticularsInput,
} from './validation';

describe('validateContactEmail', () => {
  it('accepts an ordinary address and lowercases it', () => {
    const result = validateContactEmail('  Lyimos673@Gmail.com ');
    expect(result).toEqual({ ok: true, value: 'lyimos673@gmail.com' });
  });

  it('treats an empty box as clearing the address, not as an error', () => {
    expect(validateContactEmail('   ')).toEqual({ ok: true, value: null });
  });

  it('refuses the synthetic sign-in identifier', () => {
    const result = validateContactEmail('denis.michael@tathmini.internal');
    expect(result.ok).toBe(false);
  });

  it('rejects malformed addresses', () => {
    expect(validateContactEmail('not-an-address').ok).toBe(false);
    expect(validateContactEmail('two@@at.com').ok).toBe(false);
    expect(validateContactEmail('spaces in@example.com').ok).toBe(false);
    expect(validateContactEmail('no@domain').ok).toBe(false);
  });
});

describe('validateReason', () => {
  it('collapses whitespace and accepts a real reason', () => {
    expect(validateReason('  Duplicate   register entry ')).toEqual({
      ok: true,
      value: 'Duplicate register entry',
    });
  });

  it('rejects a token reason', () => {
    expect(validateReason('fix').ok).toBe(false);
    expect(validateReason('').ok).toBe(false);
  });

  it('rejects an essay', () => {
    expect(validateReason('x'.repeat(501)).ok).toBe(false);
  });
});

describe('isUuid', () => {
  it('accepts a uuid and rejects anything else', () => {
    expect(isUuid('3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe(true);
    expect(isUuid('TEST-TP-0001')).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});

describe('validateTraineeParticulars', () => {
  const base: TraineeParticularsInput = {
    name: 'EMMANUEL  MAKANTA',
    registrationNumber: 'MVTTC/2026/001',
    course: 'CAVT',
    occupation: 'ELECTRICAL INSTALLATION',
    institution: 'MOROGORO VTC',
    modeOfStudy: 'In-Campus',
    district: 'Morogoro',
    region: 'Morogoro',
    email: 'trainee@example.com',
    phone: '0712 345 678',
  };

  it('preserves a double space inside a stored name', () => {
    const result = validateTraineeParticulars(base);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.name).toBe('EMMANUEL  MAKANTA');
  });

  it('trims the ends of a name without touching the middle', () => {
    const result = validateTraineeParticulars({ ...base, name: '  EMMANUEL  MAKANTA  ' });
    if (!result.ok) throw new Error(result.error);
    expect(result.value.name).toBe('EMMANUEL  MAKANTA');
  });

  it('turns blank optional fields into null rather than empty strings', () => {
    const result = validateTraineeParticulars({
      ...base,
      registrationNumber: '  ',
      modeOfStudy: '',
      district: '',
      region: '',
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.value.registration_number).toBeNull();
    expect(result.value.mode_of_study).toBeNull();
    expect(result.value.district).toBeNull();
    expect(result.value.region).toBeNull();
  });

  it('rejects an edit that would leave a trainee with no way to be reached', () => {
    const result = validateTraineeParticulars({ ...base, email: '', phone: '' });
    expect(result.ok).toBe(false);
  });

  it('keeps a phone-only IPT trainee valid', () => {
    const result = validateTraineeParticulars({ ...base, email: '' });
    expect(result.ok).toBe(true);
  });

  it('rejects an empty required field', () => {
    expect(validateTraineeParticulars({ ...base, institution: ' ' }).ok).toBe(false);
    expect(validateTraineeParticulars({ ...base, name: '' }).ok).toBe(false);
  });

  it('rejects a phone number with letters in it', () => {
    expect(validateTraineeParticulars({ ...base, phone: 'call the office' }).ok).toBe(false);
  });
});
