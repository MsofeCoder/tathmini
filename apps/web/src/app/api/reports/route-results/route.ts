import { PassThrough } from 'node:stream';
import { loadSupervisorRouteSheets } from '@/lib/reports/route-results/data';
import { routeSheet } from '@/lib/reports/route-results/layout';
import { writeRouteResultsWorkbook } from '@/lib/reports/route-results/xlsx';
import { createClient } from '@/lib/supabase/server';

/**
 * A supervisor's own routes, as one spreadsheet.
 *
 * A route handler rather than a page, for the reason AGENTS.md rule 9 gives
 * and one more: this is a download, not a navigation. `isShellPath()` is an
 * allowlist and `/api` is not on it, so the service worker never answers this
 * url with the app shell — the browser saves a file and the shell the
 * supervisor was looking at is never unmounted.
 *
 * Every read runs on the caller's own session. That is not only the rule
 * (AGENTS.md: the service-role key never enters this process), it is what
 * makes the file correct with no filtering of ours:
 * `assessment_marks_select` already refuses a colleague's marks until both
 * slots are submitted, so a supervisor who downloads mid-route gets their own
 * marks and blanks beside them. The sheet's header note explains the blanks,
 * because a supervisor who is not told will read them as lost work.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function stamp(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role, active')
    .eq('id', user.id)
    .maybeSingle();

  /**
   * Supervisors only, for now — the College's decision, and deliberately NOT
   * `adminAccess()`, which answers 'deny' for a supervisor because it was
   * written to guard the console. Reusing it here would refuse every real
   * user of this button. Widening this to the Coordinator later is this list,
   * not a refactor.
   */
  const allowed = new Set(['supervisor']);
  if (!profile || profile.active === false || !allowed.has(profile.role as string)) {
    return Response.json(
      { error: 'Only a supervisor may download their route results.' },
      { status: 403 },
    );
  }

  const sheets = await loadSupervisorRouteSheets(supabase, user.id);
  if (sheets.length === 0) {
    // Not an error: a supervisor with no trainees yet. The button is hidden
    // in that case, so this is the direct-url path.
    return Response.json(
      { error: 'You have no trainees assigned yet, so there is nothing to download.' },
      { status: 404 },
    );
  }

  const models = sheets.map((sheet) =>
    routeSheet({
      routeCode: sheet.routeCode,
      routeLabel: sheet.routeLabel,
      track: sheet.track,
      rows: sheet.rows,
    }),
  );

  // One route names the file after itself; two or more cannot, so the file
  // is named for what it is. Both carry the date — these get kept.
  const soleRoute = sheets.length === 1 ? sheets[0] : undefined;
  const filename = soleRoute
    ? `${soleRoute.routeCode.replace(/\s+/g, '-')}-Results-${stamp(new Date())}.xlsx`
    : `Tathmini-Results-${stamp(new Date())}.xlsx`;

  const node = new PassThrough();
  // Deliberately not awaited: ExcelJS writes into the stream while the
  // response is already being sent. A failure mid-write destroys the stream,
  // which the client sees as a truncated download rather than a valid file
  // with rows missing.
  void writeRouteResultsWorkbook(models, node).catch((error: unknown) => {
    node.destroy(error instanceof Error ? error : new Error(String(error)));
  });

  return new Response(node as unknown as ReadableStream, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
