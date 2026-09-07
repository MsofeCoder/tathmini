'use client';

/**
 * The auto-comment suggestions, ported from the prototype's Comments step.
 *
 * Suggestions, never text written on the supervisor's behalf: each one can be
 * waved away, and "Add all" merges them into the box as ordinary editable
 * prose so what the trainee reads is one voice rather than a list of
 * clippings. Nothing is inserted unless the supervisor asks for it —
 * CONTEXT.md's first non-negotiable is that the supervisor owns the
 * assessment decision, and the comment is part of that decision.
 *
 * Renders nothing when there is nothing to suggest, so a criterion marked at
 * full marks stays quiet.
 */
export function AdviceSuggestions({
  items,
  onDismiss,
  onAddAll,
}: {
  items: { id: string; text: string }[];
  onDismiss: (criterionId: string) => void;
  onAddAll: (lines: string[]) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="mt-2.5">
      <div className="flex items-center gap-2">
        <span className="rounded-[5px] bg-[#ffe9c2] px-1.5 py-0.5 text-[10.5px] font-extrabold tracking-[0.6px] text-[#6b4400]">
          SUGGESTED
        </span>
        <span className="text-[12px] text-[#5b6b78]">
          {items.length} {items.length === 1 ? 'suggestion' : 'suggestions'}
        </span>
      </div>

      <div className="mt-2 flex flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-start gap-2 rounded-[10px] border border-[#f0dcb4] bg-[#fffaf0] p-3"
          >
            <p className="flex-1 text-[13.5px] leading-relaxed text-[#4a3a1a]">{item.text}</p>
            <button
              type="button"
              onClick={() => onDismiss(item.id)}
              aria-label="Remove this suggestion"
              className="focus:outline-accent min-h-11 min-w-11 shrink-0 text-[18px] text-[#7a5f22] focus:outline focus:outline-[3px] focus:outline-offset-2"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onAddAll(items.map((item) => item.text))}
        className="focus:outline-accent mt-2 min-h-11 w-full rounded-[10px] border border-[#ccd7d4] bg-white text-[13.5px] font-bold text-[#3c4c58] focus:outline focus:outline-[3px] focus:outline-offset-2"
      >
        Add {items.length === 1 ? 'this' : 'all'} to my comment ↓
      </button>
    </div>
  );
}
