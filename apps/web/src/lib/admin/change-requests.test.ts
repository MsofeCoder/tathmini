import { describe, expect, it } from 'vitest';
import {
  CHANGE_FIELDS,
  changeField,
  fieldLabel,
  hasDrifted,
  isNoChange,
  requestStatusStyle,
  validateRequestedValue,
} from './change-requests';

describe('CHANGE_FIELDS', () => {
  it('offers only register particulars — never a mark, a route or an assessor', () => {
    const keys = CHANGE_FIELDS.map((f) => f.key);
    for (const forbidden of ['route_id', 'track', 'total', 'grade', 'supervisor_id', 'slot']) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it('matches the columns the database constraint allows', () => {
    // Migration 0030's CHECK constraint lists exactly these.
    expect(CHANGE_FIELDS.map((f) => f.column).sort()).toEqual(
      [
        'course',
        'district',
        'email',
        'institution',
        'mode_of_study',
        'name',
        'occupation',
        'phone',
        'region',
        'registration_number',
      ].sort(),
    );
  });

  it('has a unique key per field', () => {
    expect(new Set(CHANGE_FIELDS.map((f) => f.key)).size).toBe(CHANGE_FIELDS.length);
  });

  it('names a field readably, and falls back to the key rather than showing nothing', () => {
    expect(fieldLabel('email')).toBe('E-mail address');
    expect(fieldLabel('made_up')).toBe('made_up');
    expect(changeField('made_up')).toBeNull();
  });
});

describe('validateRequestedValue', () => {
  it('refuses a field that is not requestable', () => {
    expect(validateRequestedValue('route_id', 'anything').ok).toBe(false);
  });

  it('accepts and lowercases an e-mail address', () => {
    expect(validateRequestedValue('email', ' Someone@Example.COM ')).toEqual({
      ok: true,
      value: 'someone@example.com',
    });
  });

  it('refuses the sign-in identifier as a trainee address', () => {
    expect(validateRequestedValue('email', 'someone@tathmini.internal').ok).toBe(false);
  });

  it('treats an empty optional field as clearing it', () => {
    expect(validateRequestedValue('email', '   ')).toEqual({ ok: true, value: null });
    expect(validateRequestedValue('phone', '')).toEqual({ ok: true, value: null });
  });

  it('refuses to empty a required field', () => {
    expect(validateRequestedValue('name', '  ').ok).toBe(false);
    expect(validateRequestedValue('institution', '').ok).toBe(false);
  });

  it('keeps a double space inside a stored name', () => {
    const result = validateRequestedValue('name', '  EMMANUEL  MAKANTA ');
    expect(result).toEqual({ ok: true, value: 'EMMANUEL  MAKANTA' });
  });

  it('rejects a phone number with letters in it', () => {
    expect(validateRequestedValue('phone', 'ring the office').ok).toBe(false);
    expect(validateRequestedValue('phone', '+255 712 345 678').ok).toBe(true);
  });

  it('rejects a value too long for the register', () => {
    expect(validateRequestedValue('institution', 'x'.repeat(201)).ok).toBe(false);
  });
});

describe('isNoChange', () => {
  it('spots a request that asks for what is already there', () => {
    expect(isNoChange('a@b.com', 'a@b.com')).toBe(true);
    expect(isNoChange(null, null)).toBe(true);
    expect(isNoChange(null, '')).toBe(true);
  });

  it('sees a real change, including clearing a value', () => {
    expect(isNoChange('a@b.com', 'c@d.com')).toBe(false);
    expect(isNoChange('a@b.com', null)).toBe(false);
  });
});

describe('hasDrifted', () => {
  it('notices when the register moved after the request was raised', () => {
    expect(hasDrifted('old@x.com', 'someone-else-fixed-it@x.com')).toBe(true);
  });

  it('is quiet when nothing has changed underneath', () => {
    expect(hasDrifted('old@x.com', 'old@x.com')).toBe(false);
    expect(hasDrifted(null, null)).toBe(false);
  });
});

describe('requestStatusStyle', () => {
  it('gives each status its own treatment', () => {
    const styles = (['pending', 'applied', 'declined'] as const).map(requestStatusStyle);
    expect(new Set(styles.map((s) => s.bg)).size).toBe(3);
    expect(requestStatusStyle('pending').label).toBe('Waiting');
  });
});
