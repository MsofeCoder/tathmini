/**
 * Presentation helpers for the console. Pure, and deliberately explicit
 * about the timezone: the College is in Tanzania (EAT, UTC+3), the database
 * stores `timestamptz`, and Vercel's runtime is UTC. Left to the default
 * locale, an audit entry made at 01:00 on Monday in Morogoro would be shown
 * as Sunday evening — the exact ambiguity an audit trail exists to remove.
 */
const EAT = 'Africa/Dar_es_Salaam';

/**
 * Month names are ours rather than the locale's on purpose. `Intl` follows
 * whatever CLDR the runtime ships — recent versions render September in
 * en-GB as "Sept", older ones as "Sep" — so a date rendered on Vercel and
 * the same date rendered on a college laptop could differ in spelling. An
 * audit trail should read identically everywhere, so only the arithmetic
 * (which day is it in Morogoro?) is delegated to Intl.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface EatParts {
  day: string;
  month: string;
  year: string;
  hour: string;
  minute: string;
}

function eatParts(iso: string | null | undefined): EatParts | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: EAT,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  const monthIndex = Number(value('month')) - 1;
  return {
    day: value('day'),
    month: MONTHS[monthIndex] ?? value('month'),
    year: value('year'),
    // Midnight comes back as "24" from some ICU builds in hour12: false.
    hour: value('hour') === '24' ? '00' : value('hour'),
    minute: value('minute'),
  };
}

export function formatTimestamp(iso: string | null | undefined): string {
  const parts = eatParts(iso);
  if (!parts) return '—';
  return `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute}`;
}

export function formatDate(iso: string | null | undefined): string {
  const parts = eatParts(iso);
  if (!parts) return '—';
  return `${parts.day} ${parts.month} ${parts.year}`;
}

/**
 * `audit_log.action` holds Postgres' own TG_OP, written by log_audit() in
 * 0001_rls_and_functions.sql — 'INSERT' | 'UPDATE' | 'DELETE'. Rendered as
 * plain English against the table it touched, because a coordinator reading
 * the trail should not have to know what TG_OP is.
 */
export function auditActionText(action: string, table: string): string {
  const subject = TABLE_NOUNS[table] ?? table.replace(/_/g, ' ');
  if (action === 'INSERT') return `Added ${subject}`;
  if (action === 'UPDATE') return `Changed ${subject}`;
  if (action === 'DELETE') return `Removed ${subject}`;
  return `${action} · ${subject}`;
}

const TABLE_NOUNS: Record<string, string> = {
  trainees: 'a trainee',
  routes: 'a route',
  assignments: 'an assessor assignment',
  users: 'an account',
  assessment_marks: 'a submitted mark',
  results: 'a result',
  result_revisions: 'a result revision',
  reports: 'a report',
  reassignments: 'a reassignment',
  notifications: 'a notification',
};

/** "12 of 41" style counter, with the zero case spelled out rather than "0 of 0". */
export function countOf(part: number, whole: number): string {
  if (whole === 0) return 'none';
  return `${part} of ${whole}`;
}

/** Whole-number percentage for a progress bar; 0 when there is nothing to divide by. */
export function percentOf(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}
