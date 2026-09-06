import { createClient } from '@/lib/supabase/server';
import { generateAndSendReport } from '@/lib/reports/generate';

/**
 * Generating and sending one report, with a budget that does not depend on
 * which page asked for it.
 *
 * This exists because of a bug that silently lost every report queued offline.
 * A Server Action runs inside the serverless function of the route that
 * invoked it and inherits that route's `maxDuration`. OutboxDrainer is mounted
 * in the root layout, so on reconnect it fires from wherever the supervisor
 * happens to be — in practice `/offline` or `/pending`, which are client
 * components and therefore cannot declare a duration at all. Those inherit the
 * platform default, which a headless Chromium cold start alone exceeds. The
 * action timed out, the drainer caught the throw and moved on, and the report
 * sat in the queue having told the supervisor it was on its way.
 *
 * A route handler carries its own `maxDuration`, so the drain path gets the
 * same 60 seconds the profile button always had.
 */
export const maxDuration = 60;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ traineeId: string }> },
) {
  const { traineeId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // 401 so the drainer can tell "signed out" from "try again later" — a
    // signed-out device must keep the entry queued, not discard it.
    return Response.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const result = await generateAndSendReport(supabase, user.id, traineeId);

  // Always 200 with the result shape the caller already understands. A failure
  // here is a business outcome ("submit your assessment first"), not a
  // transport error, and the drainer decides what to do with it — mapping
  // those onto HTTP status codes would make a retryable timeout and a
  // permanent refusal look the same to a device with a flapping signal.
  return Response.json(result, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
