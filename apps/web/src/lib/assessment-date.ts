/**
 * The date an assessment was actually carried out.
 *
 * Requested by supervisors, and the reason is the field rather than the
 * software: a lesson is observed on Monday in a workshop with no signal, and
 * the marks reach the College on Wednesday. The report was printing Wednesday
 * — `assessment_marks.submitted_at`, the moment the row landed — beside the
 * assessor's signature, where the paper VETA form has always carried the day
 * the assessment happened. On a certificate record that is simply the wrong
 * fact.
 *
 * So the supervisor sets it before submitting, and it is written with the mark
 * itself. It is stored as a plain calendar date, never a timestamp: nobody is
 * recording the hour a lesson was observed, and a timestamp would drag time
 * zones into a field whose whole job is to say "Monday".
 *
 * One date per instrument, not per trainee. TP Theory and TP Practical are two
 * separate observations that genuinely happen on different days, they are two
 * `assessment_marks` rows, and the report gives each its own page with its own
 * DATE line. Anything else would print one of them wrongly.
 */

/**
 * How far either side of today a date may sit. Beyond a year in either
 * direction it is almost certainly a mistyped year, which is the one mistake
 * this field really attracts — and the only thing left to catch now that
 * future dates are allowed.
 */
const MAX_DAYS_BACK = 365;
const MAX_DAYS_AHEAD = 365;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Today in East Africa Time, as `YYYY-MM-DD`.
 *
 * Tanzania is UTC+3 with no daylight saving, so shifting and reading the UTC
 * calendar date is exact rather than an approximation. It matters late in the
 * evening: at 22:00 in Morogoro the UTC date is still yesterday, and a
 * supervisor filing the day's work would be offered the wrong default and told
 * that today is in the future.
 */
export function todayInEat(now: Date = new Date()): string {
  return new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. Negative means before. */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export type DateResult = { ok: true; value: string | null } | { ok: false; error: string };

/**
 * Checks a date the supervisor typed, against today in East Africa Time.
 *
 * Empty is allowed and means null: the report then falls back to the
 * submission date exactly as it did before this field existed. That is the
 * honest resting state for the thousands of marks already submitted without
 * one, and it means a cleared box degrades to the old behaviour rather than
 * blocking a supervisor who is trying to file work.
 *
 * A future date is ALLOWED, at the College's request. It was refused at first
 * on the reasoning that an assessment which has not happened cannot be dated —
 * but the field is used for more than "the day I observed the lesson": the
 * College dates some reports to an official day, such as the end of the
 * assessment period, which is often still ahead when the marks are filed. That
 * is a decision about the College's own records, not a defect.
 *
 * What is still refused is a date more than a year away in either direction. A
 * mistyped year is the one mistake this field genuinely attracts, and with
 * both past and future open it is the only check left that can catch one.
 */
export function validateAssessmentDate(raw: string, today: string): DateResult {
  const value = raw.trim();
  if (value === '') return { ok: true, value: null };

  if (!ISO_DATE.test(value)) {
    return { ok: false, error: 'Enter the date as a date — day, month and year.' };
  }

  // Rejects 31 February, which matches the pattern but is not a day. A real
  // date survives the round trip; an invalid one is normalised to something
  // else, or to Invalid Date.
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return { ok: false, error: 'That is not a real date.' };
  }

  const offset = daysBetween(today, value);
  if (offset > MAX_DAYS_AHEAD) {
    return { ok: false, error: 'That date is more than a year ahead — check the year.' };
  }
  if (offset < -MAX_DAYS_BACK) {
    return { ok: false, error: 'That date is more than a year ago — check the year.' };
  }

  return { ok: true, value };
}

/**
 * `2026-09-08` as `08/09/2026`, for the report.
 *
 * Formatted from the string rather than through `Date`: `new Date('2026-09-08')`
 * is midnight UTC, and rendering that with `toLocaleDateString` anywhere west
 * of Greenwich prints the day before. The report is a record of a date, so it
 * must print the date it was given and nothing else.
 */
export function formatAssessmentDate(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

/**
 * What the report prints beside the assessor's signature: the date the
 * assessment was carried out, or — for every mark submitted before this field
 * existed — the date it was submitted.
 */
export function reportDateLine(
  assessedOn: string | null | undefined,
  submittedAt: string | null | undefined,
): string {
  if (assessedOn) return formatAssessmentDate(assessedOn);
  if (submittedAt) return new Date(submittedAt).toLocaleDateString('en-GB');
  return '—';
}
