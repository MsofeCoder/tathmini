'use client';

import { isFlagged, scoreOptionsFor, type CriterionKind, type CriterionRow } from '@/lib/marking';

/**
 * One scorable sub-question: its code, its wording verbatim from the VETA
 * form, its point buttons, and the below-half hint.
 *
 * Lifted out of `marking-form.tsx` unchanged when the TP stepper arrived, so
 * the two screens cannot drift apart in how a score is offered or how a
 * flagged item reads. The 44 px touch targets and the anchor id are part of
 * the contract: `#criterion-<id>` is what the gap list scrolls to.
 */

export const criterionAnchor = (id: string) => `criterion-${id}`;

export function CriterionCard({
  criterion,
  kind,
  score,
  onScore,
}: {
  criterion: CriterionRow;
  kind: CriterionKind;
  score: number | null;
  onScore: (score: number) => void;
}) {
  const options = scoreOptionsFor(kind, criterion.itemMax);
  const flagged = score != null && isFlagged(kind, score, criterion.itemMax);

  return (
    <div
      id={criterionAnchor(criterion.id)}
      className="scroll-mt-32 rounded-xl border border-[#e1e9e6] bg-white p-3.5"
    >
      <div className="flex items-start gap-2.5">
        <span className="min-w-[18px] pt-px text-[12px] font-bold text-[#6b7b88]">
          {criterion.itemCode}
        </span>
        <div className="flex-1 text-[14px] leading-snug text-[#24333e]">{criterion.itemLabel}</div>
        <span className="whitespace-nowrap rounded-full bg-[#f1f3f4] px-2 py-1 text-[11px] font-bold text-[#4d5f6c]">
          {kind === 'ipt' ? '1–5' : `/ ${criterion.itemMax}`}
        </span>
      </div>
      <div role="group" className="mt-3 flex flex-wrap gap-2">
        {options.map((opt) => {
          const pressed = score === opt;
          return (
            <button
              key={opt}
              type="button"
              aria-pressed={pressed}
              onClick={() => onScore(opt)}
              className={`focus:outline-accent min-h-11 min-w-11 rounded-lg border px-3 text-[14px] font-bold focus:outline focus:outline-[3px] focus:outline-offset-2 ${
                pressed
                  ? 'border-[#0d4a43] bg-[#12665b] text-white'
                  : 'border-[#ccd7d4] bg-white text-[#3c4c58]'
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {score == null ? <p className="mt-2.5 text-[12px] text-[#5b6b78]">Not yet scored</p> : null}
      {/* A hint, not a box. The comment belongs to the whole criterion — the
          paper form's COMMENTS cell is merged across every sub-criterion row
          in the group. */}
      {flagged ? (
        <div className="mt-2.5 rounded-lg bg-[#fff4e0] px-2.5 py-2 text-[12px] leading-snug text-[#6b4400]">
          {kind === 'ipt'
            ? 'Scored 3 or below — worth a note in the comments.'
            : 'Below half of this item’s marks — worth a note in the comments.'}
        </div>
      ) : null}
    </div>
  );
}
