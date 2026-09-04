/**
 * VETA grading key (verbatim from reference/forms/ and CONTEXT.md).
 * A 80–100% · B 65–79% · C 50–64% · D 40–49% · F 0–39%.
 * Mirrors reference/Tathmini.dc.html's gradeFor/classOfAward/gpaFor/evaluate
 * so the prototype's behaviour is the source of truth, not a reinterpretation.
 */

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';
export type ClassOfAward = 'First Class' | 'Second Class' | 'Pass' | null;

export function gradeFor(pct: number): Grade {
  if (pct >= 80) return 'A';
  if (pct >= 65) return 'B';
  if (pct >= 50) return 'C';
  if (pct >= 40) return 'D';
  return 'F';
}

export function classOfAward(grade: Grade): ClassOfAward {
  if (grade === 'A') return 'First Class';
  if (grade === 'B') return 'Second Class';
  if (grade === 'C') return 'Pass';
  return null;
}

function lerp(lo: number, hi: number, a: number, b: number, pct: number): number {
  return lo + ((pct - a) / (b - a)) * (hi - lo);
}

/** GPA bands: A 3.5–4.0, B 3.0–3.4, C 2.0–2.9; not awarded for D/F. */
export function gpaFor(pct: number, grade: Grade): number | null {
  if (grade === 'A') return Math.min(4.0, lerp(3.5, 4.0, 80, 100, pct));
  if (grade === 'B') return lerp(3.0, 3.4, 65, 79.999, pct);
  if (grade === 'C') return lerp(2.0, 2.9, 50, 64.999, pct);
  return null;
}

export interface EvaluationResult {
  total: number;
  max: number;
  pct: number;
  grade: Grade;
  gpa: number | null;
  classOfAward: ClassOfAward;
  /**
   * The printed report labels this tick box COMPETENT / NOT COMPETENT
   * (see reference/Tathmini Result Report.dc.html), not the paper form's
   * own "Standard attained" wording — a deliberate, already-built
   * divergence, not an open question.
   */
  competent: boolean;
}

/**
 * Official mark for a trainee is the mean of the submitted assessor slots
 * (CONTEXT.md: "Just average. No flagging, no third assessor, no divergence
 * threshold"), rounded to one decimal to match the prototype's resultOf().
 * This is the reference implementation for the Postgres generated column —
 * the two must agree, since the server, not this package, is authoritative.
 */
export function averageTotals(totals: number[]): number {
  if (totals.length === 0) return 0;
  const avg = totals.reduce((a, v) => a + v, 0) / totals.length;
  return Math.round(avg * 10) / 10;
}

export function evaluate(total: number, max: number): EvaluationResult {
  const pct = max ? (total / max) * 100 : 0;
  const grade = gradeFor(pct);
  const gpa = gpaFor(pct, grade);
  return {
    total,
    max,
    pct,
    grade,
    gpa: gpa === null ? null : Math.round(gpa * 10) / 10,
    classOfAward: classOfAward(grade),
    competent: pct >= 50,
  };
}
