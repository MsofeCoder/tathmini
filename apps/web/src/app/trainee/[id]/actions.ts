'use server';

import { createHash, randomUUID } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { getReportData } from '@/lib/reports/data';
import { renderReportHtml } from '@/lib/reports/render';
import { renderPdf } from '@/lib/reports/pdf';

export type GenerateReportResult = { url: string } | { error: string };

/**
 * Generates the VETA result PDF for a locked trainee result, stores it in
 * the private `reports` Storage bucket, records its SHA-256 hash (ROADMAP.md
 * Phase 2: "SHA-256 hash stored with each generated report"), and returns a
 * short-lived signed URL — never a public path (AGENTS.md "Never do these").
 *
 * Runs entirely through the caller's own authenticated Supabase client.
 * Migration 0014's RLS is what actually gates this — a caller who isn't a
 * coordinator/super_admin/assigned supervisor gets zero rows back from
 * getReportData and a rejected storage insert, not a client-side check.
 */
export async function generateReport(traineeId: string): Promise<GenerateReportResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const data = await getReportData(supabase, traineeId);
  if (!data) {
    return { error: 'This result is not locked yet — a report needs both assessors submitted.' };
  }

  const reportRef = `TM-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  const html = renderReportHtml(data, reportRef);
  const pdf = await renderPdf(html);
  const hash = createHash('sha256').update(pdf).digest('hex');
  const storagePath = `${traineeId}/${data.result.id}-${hash.slice(0, 12)}.pdf`;

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
