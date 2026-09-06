import { createHash, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getReportData } from './data';
import { renderReportHtml } from './render';
import { renderPdf } from './pdf';
import { reportFileNames } from './naming';
import { sendResultEmail, type EmailOutcome } from '@/lib/notifications/send';

export type GenerateReportResult = { url: string; email: EmailOutcome } | { error: string };

/**
 * Generating a report is a LONG operation — a headless Chromium cold start, an
 * A4 render, a storage upload and an SMTP handshake. It lives here, callable
 * from two places, for a reason that cost a supervisor their report:
 *
 * A Server Action executes inside the serverless function of whatever route
 * invoked it, and inherits that route's `maxDuration`. `trainee/[id]/page.tsx`
 * declares 60s, so tapping the button there worked. But OutboxDrainer is
 * mounted in the ROOT LAYOUT and fires wherever the supervisor happens to be —
 * in practice `/trainee` or `/pending`, which are static CLIENT pages and
 * therefore cannot export `maxDuration` at all. Those inherit the platform default,
 * which Chromium alone exceeds, so every queued report timed out, the drainer
 * caught the throw, and the entry sat in the queue looking like it had sent.
 *
 * `app/api/reports/[traineeId]/route.ts` wraps this with its own 60s budget so
 * the drain path gets the time it needs regardless of which page triggered it.
 */
export async function generateAndSendReport(
  supabase: SupabaseClient,
  userId: string,
  traineeId: string,
): Promise<GenerateReportResult> {
  const { data: assignment } = await supabase
    .from('assignments')
    .select('slot')
    .eq('trainee_id', traineeId)
    .eq('supervisor_id', userId)
    .maybeSingle();
  if (!assignment) {
    return { error: 'You are not assigned to this trainee.' };
  }

  const data = await getReportData(supabase, traineeId, { slot: assignment.slot as 'a1' | 'a2' });
  if (!data) {
    return { error: 'Submit your assessment first — there is nothing to report on yet.' };
  }

  // Every instrument the track requires must carry this assessor's own mark.
  // A TP report with the Practical half missing is not a VETA document, and
  // once stored it cannot be replaced — reports, like marks, are append-only.
  const missing = data.instruments.filter(
    (instrument) => instrument.bySlot[assignment.slot as 'a1' | 'a2'] === null,
  );
  if (missing.length > 0) {
    const names = missing.map((instrument) => instrument.label).join(' and ');
    return { error: `Submit your ${names} assessment as well before storing the report.` };
  }

  const reportRef = `TM-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  const html = renderReportHtml(data, reportRef);
  const pdf = await renderPdf(html);
  const hash = createHash('sha256').update(pdf).digest('hex');

  // Route decides the storage folder, not the document's contents, so it is
  // fetched here rather than carried through the render model.
  const { data: routeRow } = await supabase
    .from('trainees')
    .select('route:routes(code)')
    .eq('id', traineeId)
    .maybeSingle();

  const { storagePath, downloadName } = reportFileNames({
    traineeId,
    slot: assignment.slot as 'a1' | 'a2',
    trainee: data.trainee,
    routeCode: (routeRow?.route as unknown as { code: string } | null)?.code ?? null,
    resultId: data.result.id,
    hash,
  });

  const upload = await supabase.storage.from('reports').upload(storagePath, pdf, {
    contentType: 'application/pdf',
    upsert: false,
  });
  // Same hash content re-requested (upsert:false 409s on a repeat click) —
  // the object already exists, so proceed to sign it rather than fail.
  if (upload.error && !upload.error.message.includes('already exists')) {
    return { error: `Could not store the report: ${upload.error.message}` };
  }

  const { error: insertError } = await supabase.from('reports').insert({
    trainee_id: traineeId,
    result_id: data.result.id,
    storage_path: storagePath,
    sha256_hash: hash,
    generated_by_id: userId,
  });
  if (insertError) {
    return { error: `Could not record the report: ${insertError.message}` };
  }

  // `download` sets Content-Disposition, so the supervisor's phone saves the
  // readable name rather than the storage key's hash-suffixed slug.
  const signed = await supabase.storage
    .from('reports')
    .createSignedUrl(storagePath, 300, { download: downloadName });
  if (signed.error || !signed.data) {
    return {
      error: `Could not create a download link: ${signed.error?.message ?? 'unknown error'}`,
    };
  }

  // Sending is the second half of "Submit and Send", but it is not allowed to
  // undo the first. The report is stored and recorded by this point; if the
  // mail fails, the supervisor is told it was saved but not sent, and the
  // Coordinator can re-send. Throwing here would strand a stored, hashed,
  // append-only report behind an error screen.
  const email = await sendResultEmail({
    supabase,
    userId,
    traineeId,
    data,
    pdf,
    filename: downloadName,
    reportRef,
  });

  return { url: signed.data.signedUrl, email };
}
