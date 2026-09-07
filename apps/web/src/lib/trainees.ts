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
  /** True if this device holds an unsubmitted local draft for this trainee. */
  hasDraft: boolean;
}

export interface RouteProgress {
  assessed: number;
  inProgress: number;
  notStarted: number;
  /** Whole-percent completion, for the route list's progress bar. */
  pct: number;
}

/**
 * The route list's three summary counters, counted from THIS supervisor's
 * point of view — which is the only view they can act on.
 *
 * 'partial' counts as assessed, not as outstanding. It means this
 * supervisor has submitted every instrument their track requires and is
 * waiting on the OTHER assessor, which is not work they can do anything
 * about. Counting it as still-to-assess is what made the tiles read
 * "0 of 5 assessed · 5 still to assess" on a route where three trainees
 * were already marked — a supervisor who finished a whole route would
 * have seen no progress at all.
 *
 * A trainee is in progress when the work is genuinely started but not
 * finished, from either half of the split:
 *   - part of a multi-instrument track submitted (TP theory in, practical
 *     not) — deriveStatus() collapses that to 'pending', so the raw counts
 *     are needed here to tell it apart from untouched;
 *   - or an unsubmitted local draft on this device, which is the only
 *     signal available for a single-instrument IPT trainee.
 */
export function routeProgress(trainees: RouteProgressInput[]): RouteProgress {
  let assessed = 0;
  let inProgress = 0;

  for (const t of trainees) {
    if (t.status === 'locked' || t.status === 'partial') {
      assessed += 1;
    } else if (t.hasDraft || (t.ownSubmittedCount > 0 && t.ownSubmittedCount < t.requiredCount)) {
      inProgress += 1;
    }
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
 * Four, not the three the summary tiles show, because the tiles' "in
 * progress" is really two different situations a supervisor acts on
 * differently:
 *
 *   - **in-progress** — part of the track is SUBMITTED and gone to the
 *     College (TP theory in, practical not). Finishing it needs the trainee
 *     in front of you again.
 *   - **drafted** — nothing has been submitted, but this phone holds
 *     unsubmitted marks. That work exists on this device and nowhere else,
 *     which is exactly the list a supervisor wants at the end of a day.
 *
 * `drafted + in-progress` therefore equals the IN PROGRESS tile, and the
 * counters never disagree.
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

/**
 * Which bucket one trainee falls in, from THIS supervisor's point of view.
 *
 * Precedence matters where a trainee qualifies for two: submitted work
 * outranks a local draft, because a draft on a trainee whose theory is
 * already in is still "in progress" to everyone but this phone.
 */
export function traineeCategory({
  status,
  ownSubmittedCount,
  requiredCount,
  hasDraft,
}: RouteProgressInput): TraineeCategory {
  if (status === 'locked' || status === 'partial') return 'assessed';
  if (ownSubmittedCount > 0 && ownSubmittedCount < requiredCount) return 'in-progress';
  if (hasDraft) return 'drafted';
  return 'not-started';
}

export function matchesFilter(filter: TraineeFilter, category: TraineeCategory): boolean {
  return filter === 'all' || filter === category;
}

/** Empty-list copy per filter — a filtered empty list must never read like an
 * empty route, which is the one thing that would send a supervisor looking
 * for a signal they do not need. */
export function emptyFilterMessage(filter: TraineeFilter): string {
  if (filter === 'assessed') return 'No trainee on this route is fully assessed yet.';
  if (filter === 'in-progress')
    return 'Nothing is part-submitted — every trainee is either finished or not started.';
  if (filter === 'drafted') return 'No unsent marks are held on this phone.';
  if (filter === 'not-started') return 'Every trainee on this route has been started.';
  return 'No trainees match.';
}
