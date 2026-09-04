/**
 * Pure helpers for the criterion-by-criterion marking UI (ROADMAP.md Phase 1
 * "Criterion-by-criterion marking, TP Theory + TP Practical + IPT"). Kept
 * framework-free and unit-tested so the scoring/gating rules — which mirror
 * packages/shared/src/schemas.ts's flag thresholds exactly — aren't
 * re-derived ad hoc inside the client component.
 */

export type CriterionKind = 'points' | 'ipt';

export interface CriterionRow {
  id: string;
  sectionCode: string;
  sectionLabel: string;
  sectionMax: number;
  itemCode: string;
  itemLabel: string;
  itemMax: number;
  orderIndex: number;
}

export interface CriterionMarkState {
  score: number | null;
  comment: string;
}

export type MarksByCriterion = Record<string, CriterionMarkState | undefined>;

export function criterionKindForInstrument(instrumentCode: string): CriterionKind {
  return instrumentCode === 'ipt' ? 'ipt' : 'points';
}

/** 0..max in 0.5 steps, e.g. max=1 -> [0, 0.5, 1]. Every real itemMax is a multiple of 0.5. */
export function pointsScoreOptions(max: number): number[] {
  const steps = Math.round(max / 0.5);
  return Array.from({ length: steps + 1 }, (_, i) => Math.round(i * 0.5 * 100) / 100);
}

export const IPT_SCORE_OPTIONS = [1, 2, 3, 4, 5] as const;

export function scoreOptionsFor(kind: CriterionKind, itemMax: number): number[] {
  return kind === 'ipt' ? [...IPT_SCORE_OPTIONS] : pointsScoreOptions(itemMax);
}

/** Below half the maximum (points scale) — matches pointsCriterionMarkSchema()'s comment trigger. */
export function isPointsFlagged(score: number, max: number): boolean {
  return score < max / 2;
}

/** 3 or below on the 1-5 scale — matches iptCriterionMarkSchema()'s comment trigger. */
export function isIptFlagged(score: number): boolean {
  return score <= 3;
}

export function isFlagged(kind: CriterionKind, score: number, max: number): boolean {
  return kind === 'ipt' ? isIptFlagged(score) : isPointsFlagged(score, max);
}

export interface Section {
  code: string;
  label: string;
  max: number;
  criteria: CriterionRow[];
}

/** Groups criteria by section, preserving orderIndex order within and across sections. */
export function groupBySection(criteria: CriterionRow[]): Section[] {
  const sorted = [...criteria].sort((a, b) => a.orderIndex - b.orderIndex);
  const bySection = new Map<string, Section>();
  for (const c of sorted) {
    let section = bySection.get(c.sectionCode);
    if (!section) {
      section = { code: c.sectionCode, label: c.sectionLabel, max: c.sectionMax, criteria: [] };
      bySection.set(c.sectionCode, section);
    }
    section.criteria.push(c);
  }
  return [...bySection.values()];
}

export function sectionSubtotal(section: Section, marks: MarksByCriterion): number {
  return section.criteria.reduce((sum, c) => sum + (marks[c.id]?.score ?? 0), 0);
}

export function scoredCount(criteria: CriterionRow[], marks: MarksByCriterion): number {
  return criteria.filter((c) => marks[c.id]?.score != null).length;
}

export interface GatingResult {
  complete: boolean;
  missing: CriterionRow[];
}

/** Every criterion the instrument defines must be scored — an unscored item is never treated as zero. */
export function gate(criteria: CriterionRow[], marks: MarksByCriterion): GatingResult {
  const missing = criteria.filter((c) => marks[c.id]?.score == null);
  return { complete: missing.length === 0, missing };
}

export interface Gap {
  criterion: CriterionRow;
  reason: 'unscored' | 'comment';
}

/**
 * Everything that blocks submission: an unscored criterion, or a scored one
 * that's flagged (below half / IPT ≤3) with no comment yet — the server's
 * pointsCriterionMarkSchema()/iptCriterionMarkSchema() would reject the
 * whole insert on the latter, so the UI gates on it too rather than letting
 * a supervisor discover it only after tapping submit.
 */
export function computeGaps(
  kind: CriterionKind,
  criteria: CriterionRow[],
  marks: MarksByCriterion,
): Gap[] {
  const gaps: Gap[] = [];
  for (const c of criteria) {
    const mark = marks[c.id];
    if (mark?.score == null) {
      gaps.push({ criterion: c, reason: 'unscored' });
    } else if (isFlagged(kind, mark.score, c.itemMax) && mark.comment.trim().length === 0) {
      gaps.push({ criterion: c, reason: 'comment' });
    }
  }
  return gaps;
}
