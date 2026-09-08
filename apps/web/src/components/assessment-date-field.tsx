'use client';

import { validateAssessmentDate } from '@/lib/assessment-date';

/**
 * "When did you carry out this assessment?", asked once, on the screen where
 * the supervisor is about to submit.
 *
 * One component for both marking screens — the TP stepper and the IPT form —
 * because the two must not drift on a field that ends up printed on a
 * certificate record. The wording and the rules live here.
 *
 * The picker offers any day, past or future. It was capped at today at first,
 * on the reasoning that an assessment which has not happened cannot be dated;
 * the College asked for the cap to go, because some reports are dated to an
 * official day — the end of the assessment period — that is still ahead when
 * the marks are filed.
 *
 * What survives is `validateAssessmentDate`, which refuses a date more than a
 * year away in either direction: with both directions open, a mistyped year is
 * the only mistake left to catch, and it is the one this field attracts. The
 * database checks nothing — a date is a date, and Postgres has no business
 * deciding which ones are plausible.
 */
export function AssessmentDateField({
  id,
  value,
  today,
  onChange,
}: {
  id: string;
  value: string | null;
  /** Today in East Africa Time, `YYYY-MM-DD`. */
  today: string;
  onChange: (value: string | null) => void;
}) {
  const checked = validateAssessmentDate(value ?? '', today);
  const error = checked.ok ? null : checked.error;

  return (
    <div className="mt-4">
      <label htmlFor={id} className="text-[13.5px] font-bold text-[#14232e]">
        Date of assessment
      </label>
      <p className="mt-1 text-[12px] leading-snug text-[#5b6b78]">
        The date printed on the trainee&rsquo;s report — not the day you send it. Normally the day
        you carried out the assessment.
      </p>
      <input
        id={id}
        type="date"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`focus:outline-accent mt-2 min-h-[48px] w-full rounded-[10px] border p-3 text-[15px] focus:outline focus:outline-[3px] focus:outline-offset-1 ${
          error ? 'border-[#8a3a2a] bg-[#fdf4f1]' : 'border-[#ccd7d4]'
        }`}
      />
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1.5 text-[12.5px] font-semibold text-[#8a3a2a]"
        >
          {error}
        </p>
      ) : (
        <p className="mt-1.5 text-[12px] text-[#5f6f7c]">
          Leave it as it is if you assessed today. A later date is allowed, for reports dated to an
          official day. If you clear it, the report shows the day it was submitted.
        </p>
      )}
    </div>
  );
}
