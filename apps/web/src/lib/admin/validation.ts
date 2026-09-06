/**
 * Input rules for the admin console's forms. Pure, so the rules are tested
 * rather than trusted, and shared by the Server Actions that apply them —
 * a form is not a validator, and everything here runs on the server after
 * the browser has had its say.
 *
 * Nothing here validates a mark, a score or a total: none of them is
 * editable from this console (AGENTS.md rules 2 and 3), so no rule for them
 * belongs here.
 */

export type FieldResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * A reachable address for a member of staff — users.contact_email.
 *
 * Deliberately NOT users.email: that column is the sign-in identifier
 * mirroring auth.users.email, which usernameToEmail() builds and
 * signInWithPassword() authenticates against. Migration 0022 wrote real
 * addresses into it and 0027 had to undo that. The console never offers
 * users.email as an editable field for the same reason.
 *
 * The check is deliberately shallow — one @, something either side, no
 * whitespace. A stricter regex rejects addresses that genuinely deliver, and
 * the only real proof is a message arriving.
 */
export function validateContactEmail(raw: string): FieldResult<string | null> {
  const value = raw.trim();
  if (value === '') return { ok: true, value: null }; // clearing it is a legitimate edit
  if (/\s/.test(value)) return { ok: false, error: 'An e-mail address cannot contain spaces.' };
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(value)) {
    return { ok: false, error: 'That does not look like an e-mail address.' };
  }
  if (/@tathmini\.internal$/i.test(value)) {
    return {
      ok: false,
      error:
        'That is the sign-in identifier, not a mailbox. Use the address the person actually reads.',
    };
  }
  return { ok: true, value: value.toLowerCase() };
}

/**
 * The typed reason CONTEXT.md requires for a Super Admin's consequential
 * action. Non-empty is the constraint the database itself enforces on
 * result_revisions.reason; the minimum length here is the console being
 * stricter than the schema on purpose — "fix" is not a reason anyone can
 * audit six months later.
 */
export function validateReason(raw: string): FieldResult<string> {
  const value = raw.trim().replace(/\s+/g, ' ');
  if (value.length < 8) {
    return { ok: false, error: 'Give a reason of at least 8 characters — it goes on the record.' };
  }
  if (value.length > 500) return { ok: false, error: 'Keep the reason under 500 characters.' };
  return { ok: true, value };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/**
 * Trainee particulars, as the register holds them.
 *
 * `name` is normalised for length only, never for whitespace: six trainees'
 * stored names carry double spaces ('EMMANUEL  MAKANTA'), migration 0023
 * silently missed exactly those six by normalising a join key, and the
 * Supabase results grid renders HTML so the defect is invisible on screen.
 * Collapsing runs of spaces here would quietly rewrite six real names — so
 * this trims the ends and leaves the middle exactly as typed.
 */
export interface TraineeParticularsInput {
  name: string;
  registrationNumber: string;
  course: string;
  occupation: string;
  institution: string;
  modeOfStudy: string;
  district: string;
  region: string;
  email: string;
  phone: string;
}

export interface TraineeParticulars {
  name: string;
  registration_number: string | null;
  course: string;
  occupation: string;
  institution: string;
  mode_of_study: string | null;
  district: string | null;
  region: string | null;
  email: string | null;
  phone: string | null;
}

const REQUIRED_LABELS: Record<string, string> = {
  name: 'Name',
  course: 'Course',
  occupation: 'Trade / occupation',
  institution: 'Institution',
};

export function validateTraineeParticulars(
  input: TraineeParticularsInput,
): FieldResult<TraineeParticulars> {
  const name = input.name.replace(/^\s+|\s+$/g, '');
  const required = {
    name,
    course: input.course.trim(),
    occupation: input.occupation.trim(),
    institution: input.institution.trim(),
  };

  for (const [field, value] of Object.entries(required)) {
    if (value === '') return { ok: false, error: `${REQUIRED_LABELS[field]} cannot be empty.` };
  }

  const email = input.email.trim();
  if (email !== '') {
    const checked = validateContactEmail(email);
    if (!checked.ok) return checked as FieldResult<TraineeParticulars>;
  }

  const phone = input.phone.trim();
  if (phone !== '' && !/^[0-9+()\-\s]{7,20}$/.test(phone)) {
    return { ok: false, error: 'A phone number may only contain digits, spaces, +, - and ().' };
  }

  /**
   * The trainees_track_contact_check CHECK constraint (migration 0002/0003)
   * is what actually enforces this, and it would reject the UPDATE anyway —
   * but a constraint violation surfaces as a Postgres error string, and the
   * person editing deserves to be told which field they emptied.
   */
  if (email === '' && phone === '') {
    return {
      ok: false,
      error: 'A trainee needs an e-mail address or a phone number — this would leave neither.',
    };
  }

  return {
    ok: true,
    value: {
      name,
      registration_number: blankToNull(input.registrationNumber),
      course: required.course,
      occupation: required.occupation,
      institution: required.institution,
      mode_of_study: blankToNull(input.modeOfStudy),
      district: blankToNull(input.district),
      region: blankToNull(input.region),
      email: email === '' ? null : email.toLowerCase(),
      phone: blankToNull(phone),
    },
  };
}

function blankToNull(raw: string): string | null {
  const value = raw.trim();
  return value === '' ? null : value;
}
