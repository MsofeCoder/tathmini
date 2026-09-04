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
