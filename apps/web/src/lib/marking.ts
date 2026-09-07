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
  reason: 'unscored';
}

/**
 * Everything that blocks submission: an unscored criterion, and nothing else.
 *
 * A missing comment used to block too — one per sub-criterion scored below
 * half. That requirement was removed on 2026-09-05: the VETA form gives each
 * CRITERION a single merged COMMENTS cell rather than one per sub-criterion,
 * the IPT form has no comments column at all, and the prototype gates only on
 * every criterion being scored. A low score now raises a suggestion the
 * supervisor may take or discard (see `isFlagged`), never a block.
 *
 * Scoring still gates absolutely: an unscored criterion is never treated as
 * zero, and `validate_and_finalize_mark()` rejects an incomplete statement in
 * the database regardless of what the client believes.
 */
export function computeGaps(criteria: CriterionRow[], marks: MarksByCriterion): Gap[] {
  return criteria
    .filter((c) => marks[c.id]?.score == null)
    .map((criterion) => ({ criterion, reason: 'unscored' as const }));
}

/**
 * Whether a whole criterion came out below half its maximum — the trigger for
 * prompting a comment on that criterion, replacing the old per-sub-criterion
 * one. Unscored items count as nothing, so this only reads as "below half"
 * once enough of the criterion is marked to make that true; the scoring gate
 * is what ensures the rest gets filled in.
 */
export function sectionBelowHalf(section: Section, marks: MarksByCriterion): boolean {
  return sectionSubtotal(section, marks) < section.max / 2;
}

/** Sub-criteria within a criterion that are individually below the flag
 * threshold. Not a gate — this is what the auto-comment suggestion list is
 * built from, and what the inline hint on a score row reports. */
export function flaggedCriteria(
  kind: CriterionKind,
  criteria: CriterionRow[],
  marks: MarksByCriterion,
): CriterionRow[] {
  return criteria.filter((c) => {
    const score = marks[c.id]?.score;
    return score != null && isFlagged(kind, score, c.itemMax);
  });
}

/**
 * The order the instruments of a track are worked in.
 *
 * Theory before Practical, always. On the paper form the classroom lesson is
 * assessed first and the workshop lesson second, and a supervisor reading the
 * profile expects the two buttons in that order; without this the order came
 * from IndexedDB, whose primary key is a random uuid, so the same trainee
 * could offer Practical first on one phone and Theory first on another.
 *
 * An unknown code sorts last rather than throwing — a new instrument must not
 * be able to hide a button.
 */
export const INSTRUMENT_ORDER = ['tp_theory', 'tp_practical', 'ipt'] as const;

export function instrumentOrder(code: string): number {
  const index = (INSTRUMENT_ORDER as readonly string[]).indexOf(code);
  return index === -1 ? INSTRUMENT_ORDER.length : index;
}

/** The two TP instruments, in the order they are marked. */
export const TP_PHASE_CODES = ['tp_theory', 'tp_practical'] as const;
export type TpPhaseCode = (typeof TP_PHASE_CODES)[number];

export function isTpPhaseCode(code: string): code is TpPhaseCode {
  return (TP_PHASE_CODES as readonly string[]).includes(code);
}

/** Phase wording, verbatim from the prototype's tracksFor() (line 1805). */
export function tpPhaseLabels(code: TpPhaseCode): { label: string; short: string } {
  return code === 'tp_theory'
    ? { label: 'Theory Lesson (Classroom)', short: 'Theory' }
    : { label: 'Practical Lesson (Workshop)', short: 'Practical' };
}

/**
 * The gate between one section of the stepper and the next.
 *
 * Returns the warning to show, or null when the section is complete. Copy is
 * verbatim from the prototype's stepNext() (line 2412) — a supervisor is told
 * how many criteria are missing rather than left pressing a button that does
 * nothing.
 *
 * This is the SECTION gate. It never replaces the whole-instrument gate in
 * `computeGaps`, nor the database's own `validate_and_finalize_mark()`, which
 * refuses an incomplete statement whatever the client believes.
 */
export function sectionGateWarning(section: Section, marks: MarksByCriterion): string | null {
  const missing = section.criteria.filter((c) => marks[c.id]?.score == null).length;
  if (missing === 0) return null;
  if (missing === section.criteria.length) {
    return `Nothing in this section is marked yet. Give a score to each of the ${missing} criteria before moving on.`;
  }
  return missing === 1
    ? '1 criterion is still unmarked in this section. Every criterion must be scored before you continue.'
    : `${missing} criteria are still unmarked in this section. Every criterion must be scored before you continue.`;
}

export interface SectionJumpRow {
  index: number;
  /** 1-based marker, or '✓' once every criterion in the section is scored. */
  marker: string;
  code: string;
  label: string;
  done: number;
  total: number;
  complete: boolean;
  current: boolean;
}

/** The rows of the "Sections ⌄" jump list, for one phase. */
export function sectionJumpRows(
  sections: Section[],
  marks: MarksByCriterion,
  currentIndex: number,
): SectionJumpRow[] {
  return sections.map((section, index) => {
    const done = scoredCount(section.criteria, marks);
    const complete = done === section.criteria.length && section.criteria.length > 0;
    return {
      index,
      marker: complete ? '✓' : String(index + 1),
      code: section.code,
      label: section.label,
      done,
      total: section.criteria.length,
      complete,
      current: index === currentIndex,
    };
  });
}

/** Whole-percent completion, guarding the empty case. */
export function percentComplete(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}
