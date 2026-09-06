import { validateContactEmail, type FieldResult } from './validation';

/**
 * Correction requests: a supervisor says a particular is wrong, a Super
 * Administrator applies or declines it.
 *
 * The rules live here, pure and tested, because both ends of the round trip
 * need the same ones — the supervisor's form must reject a malformed phone
 * number before it becomes a request, and the console must re-check the value
 * at the moment it is applied rather than trusting what was typed days
 * earlier. A register correction that sat in a queue for a week is not
 * self-evidently still correct.
 */

/**
 * What may be requested. Deliberately the register particulars and nothing
 * else: a mark is append-only, and a route change moves who may assess a
 * trainee — neither belongs in a free-text request from the field. The
 * database constrains this list too (migration 0030), so a request naming any
 * other column is refused by Postgres, not just by this file.
 */
export interface ChangeField {
  key: string;
  /** Column in `trainees`. */
  column: string;
  label: string;
  /** Shown under the box on the supervisor's form. */
  hint: string;
  /** Whether the register may hold nothing here. */
  optional: boolean;
}

export const CHANGE_FIELDS: ChangeField[] = [
  {
    key: 'email',
    column: 'email',
    label: 'E-mail address',
    hint: 'Where this trainee’s result is sent. Wrong here means someone else receives their marks.',
    optional: true,
  },
  {
    key: 'phone',
    column: 'phone',
    label: 'Phone number',
    hint: 'How the College reaches an IPT trainee.',
    optional: true,
  },
  {
    key: 'name',
    column: 'name',
    label: 'Name',
    hint: 'Exactly as it should print on the report — spacing and spelling included.',
    optional: false,
  },
  {
    key: 'registration_number',
    column: 'registration_number',
    label: 'Registration number',
    hint: 'Must be unique across the whole register.',
    optional: true,
  },
  {
    key: 'institution',
    column: 'institution',
    label: 'Institution',
    hint: 'The VTC or firm this trainee is placed with.',
    optional: false,
  },
  {
    key: 'course',
    column: 'course',
    label: 'Course',
    hint: 'CAVT, TC-TVTE or OD-TVTE.',
    optional: false,
  },
  {
    key: 'occupation',
    column: 'occupation',
    label: 'Trade / occupation',
    hint: 'The trade being assessed.',
    optional: false,
  },
  {
    key: 'mode_of_study',
    column: 'mode_of_study',
    label: 'Mode of study',
    hint: 'In-Campus or ODeL.',
    optional: true,
  },
  { key: 'district', column: 'district', label: 'District', hint: '', optional: true },
  { key: 'region', column: 'region', label: 'Region', hint: '', optional: true },
];

export function changeField(key: string): ChangeField | null {
  return CHANGE_FIELDS.find((field) => field.key === key) ?? null;
}

export function fieldLabel(key: string): string {
  return changeField(key)?.label ?? key;
}

/**
 * Validates a requested value for one field. Returns the value to write —
 * `null` where the register should hold nothing.
 *
 * `name` is trimmed at the ends only, never through the middle: six trainees'
 * stored names carry double spaces, and collapsing them would silently rewrite
 * six real names (migration 0023 learned this the expensive way).
 */
export function validateRequestedValue(fieldKey: string, raw: string): FieldResult<string | null> {
  const field = changeField(fieldKey);
  if (!field) return { ok: false, error: 'That is not a particular this system can change.' };

  const value = fieldKey === 'name' ? raw.replace(/^\s+|\s+$/g, '') : raw.trim();

  if (value === '') {
    if (!field.optional) return { ok: false, error: `${field.label} cannot be left empty.` };
    return { ok: true, value: null };
  }

  if (fieldKey === 'email') return validateContactEmail(value);

  if (fieldKey === 'phone' && !/^[0-9+()\-\s]{7,20}$/.test(value)) {
    return { ok: false, error: 'A phone number may only contain digits, spaces, +, - and ().' };
  }

  if (value.length > 200) return { ok: false, error: 'That is too long for this field.' };

  return { ok: true, value };
}

/**
 * A request must actually ask for something. Catching this here saves an
 * administrator opening a request that turns out to change nothing.
 */
export function isNoChange(current: string | null, requested: string | null): boolean {
  return (current ?? '') === (requested ?? '');
}

export type RequestStatus = 'pending' | 'applied' | 'declined';

export interface StatusStyle {
  bg: string;
  fg: string;
  label: string;
}

/** The app's own status palette — the same pairs statusMeta() uses in lib/trainees.ts. */
export function requestStatusStyle(status: RequestStatus): StatusStyle {
  if (status === 'applied') return { bg: '#e2f0ea', fg: '#1c6650', label: 'Applied' };
  if (status === 'declined') return { bg: '#fbe9e4', fg: '#8a3a2a', label: 'Declined' };
  return { bg: '#e6eefc', fg: '#243f7a', label: 'Waiting' };
}

/**
 * What the register holds now, versus what it held when the request was made.
 *
 * A request carries the value it saw at the time. If the register has moved on
 * since — somebody else corrected it, or a roster import overwrote it — then
 * applying the request blindly would undo that newer change. The console shows
 * this rather than deciding it: the administrator can see both and choose.
 */
export function hasDrifted(valueAtRequest: string | null, valueNow: string | null): boolean {
  return (valueAtRequest ?? '') !== (valueNow ?? '');
}
