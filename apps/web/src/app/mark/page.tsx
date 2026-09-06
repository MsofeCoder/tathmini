'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { MarkingForm } from '@/components/marking-form';
import { buildMarking } from '@/lib/local/derive';
import { useDeviceRows } from '@/lib/local/use-device';

/**
 * Criterion-by-criterion marking — the same screen, now reading the device.
 *
 * The supervisor still arrives at `/trainee/<id>/mark/<code>`; a rewrite
 * (next.config.ts) serves this static document for every id and code, which
 * is what makes the marking flow openable with no signal. It was already the
 * one screen that KEPT working once open — the form is client-rendered and
 * drafts to IndexedDB on every tap — but getting to it needed a server
 * render, so a supervisor who lost signal on the profile could not start.
 * That gap is what this closes.
 *
 * Every guard below mirrors one the server used to make, and each of those
 * mirrors an RLS policy that would refuse the write anyway (AGENTS.md rule
 * 1). This is the courtesy layer, not the enforcement.
 */
export default function MarkPage() {
  return (
    <Suspense fallback={<Blank />}>
      <Mark />
    </Suspense>
  );
}

function Mark() {
  const params = useSearchParams();
  const traineeId = params.get('trainee') ?? '';
  const instrumentCode = params.get('instrument') ?? '';
  const rows = useDeviceRows();

  if (!rows) return <Blank />;

  const view = buildMarking(rows, traineeId, instrumentCode);

  if (!view) {
    // One message for every "cannot mark this" case. The old screen split
    // these into "not found" / "not assigned" / wrong track, each of which
    // needed a server round trip to tell apart. On the device the honest
    // distinction is simpler and more useful: either this phone holds what
    // the form needs, or it has not been synced yet.
    return (
      <ScreenMessage
        title="Not available on this phone"
        body="This assessment is not on your route, or your route has not reached this phone yet. Open your route list once while you have a connection."
        traineeId={traineeId || undefined}
      />
    );
  }

  if (view.alreadySubmitted) {
    return (
      <ScreenMessage
        title="Already submitted"
        body={`Your ${view.instrument.label} assessment for ${view.trainee.name} was already submitted. Submitted marks are append-only — an Administrator override is required to change them.`}
        traineeId={view.trainee.id}
      />
    );
  }

  return (
    <MarkingForm
      traineeId={view.trainee.id}
      traineeName={view.trainee.name}
      instrumentId={view.instrument.id}
      instrumentCode={view.instrument.code}
      instrumentLabel={view.instrument.label}
      slot={view.slot}
      criteria={view.criteria}
    />
  );
}

function Blank() {
  return <main className="min-h-dvh bg-[#eceff0]" />;
}

function ScreenMessage({
  title,
  body,
  traineeId,
}: {
  title: string;
  body: string;
  traineeId?: string;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#eceff0] p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm">
        <p className="text-teal-mid text-[12px] font-extrabold tracking-[0.7px]">ASSESSMENT</p>
        <h1 className="mt-2 text-[22px] font-bold text-neutral-900">{title}</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-[#5b6b78]">{body}</p>
        <a
          href={traineeId ? `/trainee/${traineeId}` : '/home'}
          className="text-teal-mid mt-6 flex min-h-[48px] items-center justify-center rounded-xl border border-[#ccd7d4] text-[15px] font-semibold"
        >
          {traineeId ? '‹ Back to trainee' : 'Back to route list'}
        </a>
      </div>
    </main>
  );
}
