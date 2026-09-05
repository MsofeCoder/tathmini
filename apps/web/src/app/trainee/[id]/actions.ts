'use server';

import { createHash, randomUUID } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { getReportData } from '@/lib/reports/data';
import { renderReportHtml } from '@/lib/reports/render';
import { renderPdf } from '@/lib/reports/pdf';

export type GenerateReportResult = { url: string } | { error: string };

/**
 * Generates THIS supervisor's own VETA result PDF, stores it in the private
 * `reports` Storage bucket, records its SHA-256 hash (ROADMAP.md Phase 2:
 * "SHA-256 hash stored with each generated report"), and returns a
 * short-lived signed URL — never a public path (AGENTS.md "Never do these").
 *
 * Deliberately does NOT wait for the second assessor. Each assessor submits
 * their own report independently, and a trainee receives one per assessor —
 * the College's requirement (2026-09-05): a supervisor who is sick or
 * unreachable would otherwise block their colleague's submission entirely.
 *
 * Runs entirely through the caller's own authenticated Supabase client.
 * RLS is what actually gates this — a caller who isn't a
 * coordinator/super_admin/assigned supervisor gets zero rows back from
 * getReportData and a rejected storage insert, not a client-side check.
 */
export async function generateReport(traineeId: string): Promise<GenerateReportResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const { data: assignment } = await supabase
    .from('assignments')
    .select('slot')
    .eq('trainee_id', traineeId)
    .eq('supervisor_id', user.id)
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
  // First segment must stay the trainee id — migration 0014's Storage
  // policies scope on (storage.foldername(name))[1]::uuid. The slot makes the
  // two assessors' reports distinguishable in the bucket without opening a
  // file; the hash keeps a regenerated report from overwriting its
  // predecessor, since reports are append-only like the marks behind them.
  const storagePath = `${traineeId}/${assignment.slot}-${data.result.id}-${hash.slice(0, 12)}.pdf`;

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
    generated_by_id: user.id,
  });
  if (insertError) {
    return { error: `Could not record the report: ${insertError.message}` };
  }

  const signed = await supabase.storage.from('reports').createSignedUrl(storagePath, 300);
  if (signed.error || !signed.data) {
    return {
      error: `Could not create a download link: ${signed.error?.message ?? 'unknown error'}`,
    };
  }

  return { url: signed.data.signedUrl };
}
