'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Outline eye, matching the one in assessment-actions.tsx. Inline rather than
 * a dependency — AGENTS.md forbids adding a client-bundle package without
 * asking, and this is one path. */
function EyeIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.9" />
    </svg>
  );
}

/**
 * The report preview, opened inside the app rather than in a new tab.
 *
 * The prototype is explicit about this — "The report opens inside the app" —
 * and it is the right behaviour in the field, not just a nicer one. A new tab
 * on a mid-range Android leaves the supervisor somewhere with no route list,
 * no back affordance they recognise, and a browser chrome they then have to
 * fight to return from. Half the point of the preview is that it sits between
 * marking and an irreversible send; sending them out of the app to see it
 * makes that step feel like leaving.
 *
 * Rendered in an iframe because `/trainee/[id]/report/preview` serves a
 * complete HTML document — the same markup Chromium prints to PDF. Injecting
 * that into this page would put a second `<html>`'s styles against the app's
 * own. The iframe is same-origin, so the session cookie travels with it and
 * RLS decides what comes back exactly as it would in a tab.
 *
 * `<dialog>` rather than a hand-rolled overlay: it gives focus containment,
 * Escape, inert background content and a real backdrop from the platform,
 * none of which are worth re-implementing badly.
 */
export function ReportPreviewButton({
  traineeId,
  variant = 'button',
  label = 'Preview report',
  ariaLabel,
}: {
  traineeId: string;
  variant?: 'button' | 'icon';
  label?: string;
  ariaLabel?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // The iframe src is only set once the dialog has been opened, so opening a
  // trainee's profile does not fetch a report nobody asked to see.
  const [armed, setArmed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const open = useCallback(() => {
    setArmed(true);
    setLoaded(false);
    dialogRef.current?.showModal();
  }, []);

  const close = useCallback(() => {
    dialogRef.current?.close();
  }, []);

  // The page behind a modal must not scroll under it — on a phone that reads
  // as the report sliding away while you are trying to read it.
  useEffect(() => {
    if (!armed) return;
    const dialog = dialogRef.current;
    const restore = document.body.style.overflow;
    const sync = () => {
      document.body.style.overflow = dialog?.open ? 'hidden' : restore;
    };
    sync();
    dialog?.addEventListener('close', sync);
    return () => {
      dialog?.removeEventListener('close', sync);
      document.body.style.overflow = restore;
    };
  }, [armed]);

  return (
    <>
      {variant === 'icon' ? (
        <button
          type="button"
          onClick={open}
          title="Preview this report"
          aria-label={ariaLabel ?? 'Preview the report'}
          className="focus:outline-accent flex h-11 w-11 items-center justify-center rounded-lg text-[#12665b] focus:outline focus:outline-[3px] focus:outline-offset-2"
        >
          <EyeIcon />
        </button>
      ) : (
        <button
          type="button"
          onClick={open}
          className="focus:outline-accent mt-3 flex min-h-[48px] w-full items-center justify-center rounded-xl border border-[#12665b] text-[15px] font-semibold text-[#12665b] focus:outline focus:outline-[3px] focus:outline-offset-2"
        >
          {label}
        </button>
      )}

      <dialog
        ref={dialogRef}
        aria-label="Report preview"
        // Clicking the backdrop closes. The dialog element itself is the
        // click target when the backdrop is hit, so comparing against it
        // distinguishes that from a click inside the document.
        onClick={(event) => {
          if (event.target === dialogRef.current) close();
        }}
        onClose={() => setLoaded(false)}
        className="m-0 h-dvh max-h-none w-dvw max-w-none bg-transparent p-0 backdrop:bg-[#0d232d]/[0.62]"
      >
        <div className="flex h-full flex-col">
          <div className="flex flex-shrink-0 items-center justify-between gap-3 px-4 py-3.5">
            <div>
              <p className="text-[10.5px] font-extrabold tracking-[0.9px] text-[#bfd9d3]">
                PDF PREVIEW
              </p>
              <p className="mt-0.5 text-[14px] font-bold text-white">
                This is what will be e-mailed
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              className="focus:outline-accent min-h-11 rounded-[9px] border border-white/30 bg-white/[0.16] px-4 text-[14px] font-bold text-white focus:outline focus:outline-[3px] focus:outline-offset-2"
            >
              Close
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden px-3 pb-3">
            <div className="relative h-full overflow-hidden rounded bg-white shadow-[0_12px_32px_rgba(0,0,0,0.3)]">
              {!loaded ? (
                <p className="absolute inset-0 flex items-center justify-center text-[13px] text-[#5b6b78]">
                  Preparing the report…
                </p>
              ) : null}
              {armed ? (
                <iframe
                  src={`/trainee/${traineeId}/report/preview`}
                  title="Report preview"
                  onLoad={() => setLoaded(true)}
                  className="h-full w-full border-0"
                />
              ) : null}
            </div>
          </div>

          <div className="flex-shrink-0 px-3 pb-4">
            <button
              type="button"
              onClick={close}
              className="focus:outline-accent min-h-[52px] w-full rounded-xl bg-white text-[15.5px] font-bold text-[#0d4a43] focus:outline focus:outline-[3px] focus:outline-offset-2"
            >
              Back
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
