'use client';

import { AssessmentActions } from '@/components/assessment-actions';
import { ReportPreviewButton } from '@/components/report-preview';
import { ReportDownloadButton } from '@/components/report-download-button';
import { buildProfile } from '@/lib/local/derive';
import { useDeviceRows } from '@/lib/local/use-device';
import { traineeParticulars, trackChipStyle, trackPointsLabel } from '@/lib/trainees';

/**
 * "Pre-loaded particulars" — the same screen as before, reading the device
 * instead of the server.
 *
 * The markup, copy and colours are unchanged from the server-rendered version
 * (itself a port of the prototype's `showProfile`). What changed is where the
 * eight queries went: they are now seven IndexedDB reads that cost no network
 * at all, so this screen renders in a workshop with no signal exactly as it
 * does on wifi.
 *
 * The url a supervisor sees is still `/trainee/<id>`. It reaches this screen
 * through the app shell, which reads the id out of the path (see
 * `lib/local/route-match.ts`) — no rewrite, no query string, and no
 * per-trainee document that could be missing from the cache.
 */
export function TraineeScreen({ traineeId }: { traineeId: string }) {
  const rows = useDeviceRows();

  // Still reading. Rendering "not found" here would tell a supervisor their
  // trainee had been removed, for the half-second before IndexedDB answers.
  if (!rows) return <Blank />;

  const view = buildProfile(rows, traineeId);
  if (!view) return <NotFound />;

  const { trainee } = view;
  const track = trainee.track;
  const chip = trackChipStyle(track);
  const particulars = traineeParticulars({
    track,
    registrationNumber: trainee.registrationNumber,
    occupation: trainee.occupation,
    course: trainee.course,
    modeOfStudy: trainee.modeOfStudy,
    institution: trainee.institution,
    region: trainee.region,
    district: trainee.district,
    email: trainee.email,
    phone: trainee.phone,
    assessedByLabel: view.assessedByLabel,
  });

  return (
    <main className="min-h-dvh bg-[#eceff0]">
      <div className="border-b border-[#e1e9e6] bg-white p-4">
        <a href="/home" className="text-teal-mid text-[14px] font-semibold">
          ‹ My route
        </a>
      </div>
      <div className="p-5">
        <p className="text-[13px] font-semibold text-[#5b6b78]">You are about to assess</p>
        <h1 className="mt-1.5 text-[27px] font-bold tracking-[-0.4px] text-neutral-900">
          {trainee.name}
        </h1>

        <div className="mt-4.5 overflow-hidden rounded-2xl border border-[#e1e9e6] bg-white">
          <div className="flex items-center justify-between gap-4 border-b border-[#f1f5f4] px-4 py-3.5">
            <span className="text-[13px] font-semibold text-[#5b6b78]">Track</span>
            <span
              className="rounded-full px-2.5 py-1 text-[12px] font-bold"
              style={{ background: chip.bg, color: chip.fg }}
            >
              {trackPointsLabel(track, view.maxTotalByCode)}
            </span>
          </div>
          {particulars.map((row) => (
            <div
              key={row.label}
              className="flex justify-between gap-4 border-b border-[#f1f5f4] px-4 py-3.5 last:border-b-0"
            >
              <span className="shrink-0 text-[13px] font-semibold text-[#5b6b78]">{row.label}</span>
              <span className="text-right text-[14px] font-semibold text-[#14232e]">
                {row.value}
              </span>
            </div>
          ))}
        </div>

        <p className="mt-3 text-[12.5px] leading-relaxed text-[#5f6f7c]">
          Every particular above is pre-loaded from the College register and read-only, so the
          printed report carries the full VETA heading without the supervisor typing anything in the
          field.
        </p>

        {view.locked ? (
          <div className="mt-4 rounded-xl border border-[#dae3e0] bg-[#f1f3f4] px-4 py-3.5">
            <p className="text-[13px] font-bold text-[#3c4c58]">Record locked</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[#5b6b78]">
              This assessment was submitted and is read-only. Corrections require an Administrator
              override.
            </p>
          </div>
        ) : null}

        {view.ownSlotComplete ? (
          <div className="mt-4 rounded-xl border border-[#dae3e0] bg-white px-4 py-3.5">
            <p className="text-[13px] font-bold text-[#3c4c58]">Your report</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[#5b6b78]">
              {view.locked
                ? 'Both assessors have submitted, so this report also carries the consolidated official result.'
                : 'You have finished your own assessment. Preview it, then submit it to be stored — you do not need to wait for the second assessor.'}
            </p>
            <ReportPreviewButton traineeId={trainee.id} />
            <ReportDownloadButton
              traineeId={trainee.id}
              traineeName={trainee.name}
              alreadySentAt={view.alreadySentAt}
            />
          </div>
        ) : null}

        {view.canAssess ? (
          <AssessmentActions traineeId={trainee.id} actions={view.actions} />
        ) : null}
      </div>
    </main>
  );
}

/** The pre-read state. Deliberately empty rather than a spinner: IndexedDB
 * answers in single-digit milliseconds, and a spinner that flashes on every
 * navigation reads as slowness the app does not have. */
function Blank() {
  return <main className="min-h-dvh bg-[#eceff0]" />;
}

function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#eceff0] p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm">
        <p className="text-teal-mid text-[12px] font-extrabold tracking-[0.7px]">TRAINEE</p>
        <h1 className="mt-2 text-[22px] font-bold text-neutral-900">Not found</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-[#5b6b78]">
          This trainee is not on your route, or has not reached this phone yet. Open your route list
          while you have a connection.
        </p>
        <a
          href="/home"
          className="text-teal-mid mt-6 flex min-h-[48px] items-center justify-center rounded-xl border border-[#ccd7d4] text-[15px] font-semibold"
        >
          Back to route list
        </a>
      </div>
    </main>
  );
}
