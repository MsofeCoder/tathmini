/**
 * Trainee status, ported from reference/Tathmini.dc.html's
 * statusMeta()/statusPlain() (lines 1955–1969) — the prototype's
 * behavioural spec — but the DERIVATION is new: the prototype models one
 * trainee as one fake assessment with two slots; real trainees need
 * multiple instruments per track (TP: tp_theory + tp_practical; IPT:
 * ipt), each independently submitted per slot. See the route-list plan
 * in MEMORY.md for the reasoning.
 *
 * The prototype's fourth state, 'assessed' ("Under review" — a Super
 * Admin's reopened-for-correction result) isn't reachable yet: no
 * override flow exists (Phase 3, unbuilt). Not included here.
 */
export type TraineeStatus = 'locked' | 'partial' | 'pending';

export interface DeriveStatusInput {
  /** results.locked_at for this trainee — null/undefined if not locked. */
  lockedAt: string | null | undefined;
  /** How many of THIS supervisor's own assessment_marks are submitted for this trainee. */
  ownSubmittedCount: number;
  /** How many instruments this trainee's track requires (TP: 2, IPT: 1). */
  requiredCount: number;
}

export function deriveStatus({
  lockedAt,
  ownSubmittedCount,
  requiredCount,
}: DeriveStatusInput): TraineeStatus {
  if (lockedAt) return 'locked';
  if (requiredCount > 0 && ownSubmittedCount >= requiredCount) return 'partial';
  return 'pending';
}

export interface StatusMeta {
  bg: string;
  fg: string;
  short: string;
}

/** bg/fg/short badge label — verbatim from statusMeta() in the prototype. */
export function statusMeta(status: TraineeStatus): StatusMeta {
  if (status === 'locked') return { bg: '#e2f0ea', fg: '#1c6650', short: '✓ Assessed' };
  if (status === 'partial') return { bg: '#e6eefc', fg: '#243f7a', short: '◑ 1 of 2 assessors' };
  return { bg: '#eef1f3', fg: '#4d5f6c', short: '○ Not yet assessed' };
}

/** Plain long-form label — verbatim from statusPlain() in the prototype. */
export function statusPlain(status: TraineeStatus): string {
  if (status === 'locked') return 'Assessed';
  if (status === 'partial') return 'Awaiting 2nd assessor';
  return 'Not yet assessed';
}

/** Up to two initials from a trainee's name, for the list-row avatar. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export interface ChipStyle {
  bg: string;
  fg: string;
}

/** Track chip colours — verbatim from the prototype's track chip helper. */
export function trackChipStyle(track: 'TP' | 'IPT'): ChipStyle {
  return track === 'IPT' ? { bg: '#fff0d6', fg: '#6b4400' } : { bg: '#e2f0ea', fg: '#1c6650' };
}

export interface ParticularRow {
  label: string;
  value: string;
}

export interface TraineeParticularsInput {
  track: 'TP' | 'IPT';
  registrationNumber: string | null;
  occupation: string;
  course: string;
  modeOfStudy: string | null;
  institution: string;
  region: string | null;
  district: string | null;
  email: string | null;
  phone: string | null;
  /** e.g. "J. Mwakalinga (Assessor 1 of 2)" */
  assessedByLabel: string;
}

/**
 * Read-only "pre-loaded particulars" rows for the trainee profile
 * screen — adapted from particularsFor() in the prototype (line 2265),
 * but only the fields the real `trainees` table actually has. The
 * prototype's programme/ntaLevel/group/class/lessonTime and (IPT)
 * iptNo/industry/site/department/industrialSupervisor/weeks/
 * academicYear were never in either real September 2026 roster and
 * don't exist in the schema — showing them would mean inventing
 * values, so they're left out rather than faked.
 */
export function traineeParticulars(t: TraineeParticularsInput): ParticularRow[] {
  const regionDistrict =
    t.region && t.district ? `${t.region} · ${t.district}` : (t.region ?? t.district ?? '—');

  return [
    { label: 'Registration No', value: t.registrationNumber ?? '—' },
    { label: 'Occupation', value: t.occupation },
    { label: 'Course', value: t.modeOfStudy ? `${t.course} · ${t.modeOfStudy}` : t.course },
    { label: t.track === 'IPT' ? 'Industry / Firm' : 'VTC', value: t.institution },
    { label: 'Region / District', value: regionDistrict },
    t.track === 'IPT'
      ? { label: 'Phone', value: t.phone ?? '—' }
      : { label: 'Email', value: t.email ?? '—' },
    { label: 'Assessed by', value: t.assessedByLabel },
  ];
}

/**
 * "TP · Theory 50 + Practical 50" / "IPT · 70 pts" — verbatim phrasing
 * from the prototype's curTrackLabel, computed from real instrument
 * max_total values (never hardcoded) so it stays correct if an
 * instrument's total ever changes.
 */
export function trackPointsLabel(track: 'TP' | 'IPT', maxTotalByCode: Map<string, number>): string {
  if (track === 'IPT') {
    return `IPT · ${maxTotalByCode.get('ipt') ?? 0} pts`;
  }
  const theory = maxTotalByCode.get('tp_theory') ?? 0;
  const practical = maxTotalByCode.get('tp_practical') ?? 0;
  return `TP · Theory ${theory} + Practical ${practical}`;
}

export interface RouteProgressInput {
  status: TraineeStatus;
  /** How many of THIS supervisor's own assessment_marks are submitted for this trainee. */
  ownSubmittedCount: number;
  /** How many instruments this trainee's track requires (TP: 2, IPT: 1). */
  requiredCount: number;
  /** How far this device's unsent work on this trainee has got. */
  draftProgress: DraftProgress;
  /**
   * Whether THIS supervisor's report for this trainee has actually been sent —
   * the server's own `reports` row, or the on-device receipt written the
   * moment a send is confirmed.
   *
   * This is the single thing that makes a trainee "assessed". Submitting the
   * marks does not: the College has numbers, but the report — the document the
   * result travels on — has not left the phone.
   */
  reportSent: boolean;
}

export interface RouteProgress {
  assessed: number;
  inProgress: number;
  notStarted: number;
  /** Whole-percent completion, for the route list's progress bar. */
  pct: number;
}

/**
 * The route list's headline counters.
 *
 * Defined in terms of `traineeCategory()` rather than repeating its rules,
 * which is the whole point: the headline ("N of M assessed") and the filter
 * pills are two renderings of one answer, and the previous version computed
 * them separately and drifted. A supervisor who sees "3 of 5 assessed" above a
 * pill reading "Assessed 0" stops trusting both.
 *
 * `inProgress` is the union of `drafted` and `in-progress` — everything
 * started and not delivered. The pills split those two because a supervisor
 * acts on them differently; the headline does not need to.
 */
export function routeProgress(trainees: RouteProgressInput[]): RouteProgress {
  let assessed = 0;
  let inProgress = 0;

  for (const t of trainees) {
    const category = traineeCategory(t);
    if (category === 'assessed') assessed += 1;
    else if (category === 'drafted' || category === 'in-progress') inProgress += 1;
  }

  return {
    assessed,
    inProgress,
    notStarted: trainees.length - assessed - inProgress,
    pct: trainees.length === 0 ? 0 : Math.round((assessed / trainees.length) * 100),
  };
}

/**
 * The route list's filter buckets.
 *
 * Four, not three, because "not yet assessed" covers two situations a
 * supervisor acts on completely differently:
 *
 *   - **in-progress** — started and not finished. Needs the trainee in front
 *     of you again.
 *   - **drafted** — finished, and waiting only for the report to be sent.
 *     Needs nothing but a connection and a tap, which is exactly the list a
 *     supervisor wants at the end of a day.
 *
 * `drafted + in-progress` is everything started and not delivered, which is
 * what `routeProgress().inProgress` returns.
 */
export type TraineeFilter = 'all' | 'assessed' | 'in-progress' | 'drafted' | 'not-started';

export const TRAINEE_FILTERS: TraineeFilter[] = [
  'all',
  'assessed',
  'in-progress',
  'drafted',
  'not-started',
];

export function traineeFilterLabel(filter: TraineeFilter): string {
  if (filter === 'all') return 'All';
  if (filter === 'assessed') return 'Assessed';
  if (filter === 'in-progress') return 'In progress';
  if (filter === 'drafted') return 'Drafted';
  return 'Not started';
}

export type TraineeCategory = Exclude<TraineeFilter, 'all'>;

/** How far the unsent work on this device has got — see draftProgressFor(). */
export type DraftProgress = 'none' | 'partial' | 'complete';

/**
 * Which bucket one trainee falls in, from THIS supervisor's point of view.
 *
 * The four states follow the work, and there is exactly ONE line that moves a
 * trainee into each:
 *
 *   - **not-started** — nothing scored, nothing submitted.
 *   - **in-progress** — started and not finished. Either part of the track is
 *     submitted and the rest is not, or this phone holds a part-scored draft.
 *   - **drafted** — the assessment is FINISHED but the report has not been
 *     sent. It gets here on its own, the moment the last criterion is
 *     accounted for, whether the supervisor pressed "Save as a draft" or
 *     submitted the marks outright. The state describes the work, not the
 *     gesture.
 *   - **assessed** — the report has been sent. Nothing else earns this.
 *
 * THE LINE BETWEEN DRAFTED AND ASSESSED IS THE REPORT, NOT THE MARKS. This is
 * the correction made on 2026-09-07, and it is worth stating plainly because
 * the previous rule looked reasonable and was wrong: it called a trainee
 * assessed as soon as this supervisor had submitted every instrument. A
 * supervisor who finished both TP lessons therefore watched the trainee jump
 * straight to "✓ Assessed" while the report — the thing the College and the
 * trainee actually receive — was still sitting unsent on the phone. The badge
 * said the job was done at the exact moment the last step had not been taken,
 * which is the one place a status must never be optimistic.
 *
 * Submitted marks still matter, but as the thing that FINISHES the assessment
 * rather than the thing that delivers it: they are one of the two ways a
 * trainee reaches `drafted`, alongside a complete local draft.
 */
export function traineeCategory({
  ownSubmittedCount,
  requiredCount,
  draftProgress,
  reportSent,
}: RouteProgressInput): TraineeCategory {
  if (reportSent) return 'assessed';

  // Finished, unsent — by either route. The marks may already be at the
  // College (every instrument submitted) or still only on this phone (every
  // criterion scored); from the supervisor's side the outstanding action is
  // identical, and it is "send the report".
  const marksAllIn = requiredCount > 0 && ownSubmittedCount >= requiredCount;
  if (marksAllIn || draftProgress === 'complete') return 'drafted';

  if (draftProgress === 'partial') return 'in-progress';
  if (ownSubmittedCount > 0 && ownSubmittedCount < requiredCount) return 'in-progress';
  return 'not-started';
}

/** Row badge per bucket. An assessed row normally shows statusMeta() instead,
 * which additionally says WHICH assessor the College is still waiting for; the
 * 'assessed' case here is the fallback for a report sent against a status that
 * cannot describe it. */
export function categoryMeta(category: TraineeCategory): StatusMeta {
  if (category === 'assessed') return { bg: '#e2f0ea', fg: '#1c6650', short: '✓ Assessed' };
  if (category === 'drafted') return { bg: '#fff0d6', fg: '#6b4400', short: '◐ Draft' };
  if (category === 'in-progress') return { bg: '#fff4e0', fg: '#6b4400', short: '◔ In progress' };
  return { bg: '#eef1f3', fg: '#4d5f6c', short: '○ Not yet assessed' };
}

export function matchesFilter(filter: TraineeFilter, category: TraineeCategory): boolean {
  return filter === 'all' || filter === category;
}

/** Empty-list copy per filter — a filtered empty list must never read like an
 * empty route, which is the one thing that would send a supervisor looking
 * for a signal they do not need. */
export function emptyFilterMessage(filter: TraineeFilter): string {
  if (filter === 'assessed') return 'You have not sent a report for anyone on this route yet.';
  if (filter === 'in-progress')
    return 'Nothing is part-marked — every trainee is either finished or not started.';
  if (filter === 'drafted')
    return 'Nothing is finished and waiting to be sent. A trainee appears here as soon as their whole assessment is marked.';
  if (filter === 'not-started') return 'Every trainee on this route has been started.';
  return 'No trainees match.';
}
