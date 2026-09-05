import { describe, expect, it } from 'vitest';
import { CRITERION_ADVICE, adviceFor, adviceKey } from './advice';

describe('CRITERION_ADVICE', () => {
  it('covers every criterion on all three instruments', () => {
    const keys = Object.keys(CRITERION_ADVICE);
    expect(keys).toHaveLength(89);
    expect(keys.filter((k) => k.startsWith('tp_theory:'))).toHaveLength(41);
    expect(keys.filter((k) => k.startsWith('tp_practical:'))).toHaveLength(34);
    expect(keys.filter((k) => k.startsWith('ipt:'))).toHaveLength(14);
  });

  it('is keyed by the criteria table’s own verbatim numbering', () => {
    expect(adviceKey('tp_theory', '1', 'i')).toBe('tp_theory:1:i');
    expect(adviceKey('ipt', 'A', '1')).toBe('ipt:A:1');
  });

  /**
   * The VETA forms are explicit: comments must "not be clues such as
   * excellent, very good, good, fair etc." A phrase bank that shipped one
   * would put a forbidden word on every report that used it.
   *
   * "good" is deliberately absent from this list. Three phrases use it as an
   * ordinary adjective — "activities of good quality", "a model of good
   * occupational practice", "keep good working relations" — which is advice
   * about the work, not a verdict on the trainee. What the form prohibits is
   * a grade-clue standing in for advice, and none of these do that.
   */
  it('never uses a grade-word as a verdict, which the forms forbid', () => {
    const forbidden = /\b(excellent|very good|fair|poor|average|satisfactory)\b/i;
    const offenders = Object.entries(CRITERION_ADVICE)
      .filter(([, text]) => forbidden.test(text))
      .map(([key, text]) => `${key}: ${text}`);
    expect(offenders).toEqual([]);
  });

  it('uses "good" only adjectivally, never on its own as a rating', () => {
    const withGood = Object.values(CRITERION_ADVICE).filter((t) => /\bgood\b/i.test(t));
    expect(withGood).toHaveLength(3);
    // Always followed by the thing being described, never left standing as a
    // judgement of the trainee.
    for (const text of withGood) expect(text).toMatch(/\bgood \w+/i);
  });

  it('gives advice that is imperative and practical, not a verdict', () => {
    expect(CRITERION_ADVICE['tp_theory:1:i']).toBe(
      'Prepare your scheme of work and lesson plan before the lesson, and have both with you in class.',
    );
  });

  it('has no empty phrase', () => {
    for (const [key, text] of Object.entries(CRITERION_ADVICE)) {
      expect(text.trim().length, key).toBeGreaterThan(20);
    }
  });
});

describe('adviceFor', () => {
  it('returns the banked sentence for a known criterion', () => {
    expect(adviceFor('tp_theory', '1', 'ii', 'Ability to state lesson objectives')).toBe(
      CRITERION_ADVICE['tp_theory:1:ii'],
    );
  });

  it('falls back to the criterion’s own wording rather than saying nothing', () => {
    // A criterion added to a form later must not silently offer no advice —
    // the supervisor would never know a suggestion was missing.
    expect(adviceFor('tp_theory', '99', 'i', 'Use of digital teaching aids')).toBe(
      'Give more attention to this area: use of digital teaching aids.',
    );
  });

  it('lowercases only the first letter of the fallback, leaving names intact', () => {
    expect(adviceFor('ipt', 'Z', '1', 'PPE is worn correctly')).toBe(
      'Give more attention to this area: pPE is worn correctly.',
    );
  });
});
