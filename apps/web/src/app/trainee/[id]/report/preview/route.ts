import { createClient } from '@/lib/supabase/server';
import { getReportData } from '@/lib/reports/data';
import { renderReportHtml } from '@/lib/reports/render';

/**
 * Previews the supervisor's own VETA result report as HTML.
 *
 * Serves the SAME markup renderReportHtml() gives Chromium to print, so what
 * a supervisor reads here is what the stored PDF contains — no second
 * template to drift out of step with reference/Tathmini Result Report.dc.html.
 *
 * HTML rather than a rendered PDF on purpose: preview is tapped repeatedly
 * and casually, and the PDF path costs a headless-Chromium cold start on
 * every call. Chromium is reserved for the one deliberate action that stores
 * a file. A preview must not be the thing that fails in a workshop with bad
 * signal.
 *
 * Scoped to the caller's own assessor slot. There is no slot parameter to
 * tamper with, and even the resolved slot is only a convenience: every read
 * goes through the caller's own client, so RLS is what actually withholds a
 * colleague's marks until both assessors have submitted.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response('Not signed in.', { status: 401 });
  }

  const { data: assignment } = await supabase
    .from('assignments')
    .select('slot')
    .eq('trainee_id', id)
    .eq('supervisor_id', user.id)
    .maybeSingle();

  if (!assignment) {
    return new Response('You are not assigned to this trainee.', { status: 403 });
  }

  const data = await getReportData(supabase, id, { slot: assignment.slot as 'a1' | 'a2' });
  if (!data) {
    return new Response('Nothing to preview yet — submit an assessment first.', { status: 404 });
  }

  const html = renderReportHtml(data, 'PREVIEW');

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // A trainee's marks: never cached by a proxy, never stored to disk by
      // the browser (AGENTS.md: never log or leak a trainee's marks).
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    },
  });
}
