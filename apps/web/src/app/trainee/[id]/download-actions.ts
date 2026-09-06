'use server';

import { reportFileNames } from '@/lib/reports/naming';
import { createClient } from '@/lib/supabase/server';

export type DownloadResult = { url: string } | { error: string };

/**
 * A fresh download link for a report this supervisor has already submitted.
 *
 * The link handed back at send time is a signed URL that expires in five
 * minutes, which is right for a one-off hand-off and useless a day later. A
 * supervisor who wants their own copy of a report they sent last week — to
 * show the trainee, to keep, to print — had no way to get it: the file is in a
 * private bucket and the only link they were ever given has long expired.
 *
 * Nothing is regenerated. This signs the stored PDF — the exact bytes whose
 * SHA-256 is on the record — so the copy a supervisor downloads today is
 * byte-for-byte the document that was e-mailed, carrying its original
 * submission date rather than today's.
 *
 * RLS decides what can be read: `reports_select` and the reports bucket's own
 * SELECT policy both require the caller to be assigned to that trainee (or an
 * administrator), so a supervisor cannot sign somebody else's report by
 * guessing an id.
 */
export async function getReportDownloadUrl(traineeId: string): Promise<DownloadResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Your session has expired. Sign in again.' };

  // This supervisor's own most recent report for this trainee. A report can be
  // regenerated after a correction, and the newest is the one that was sent.
  const { data: report, error } = await supabase
    .from('reports')
    .select('storage_path, generated_at')
    .eq('trainee_id', traineeId)
    .eq('generated_by_id', user.id)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { error: `Could not find your report: ${error.message}` };
  if (!report) {
    return { error: 'You have not submitted a report for this trainee yet.' };
  }

  const { data: trainee } = await supabase
    .from('trainees')
    .select('name, registration_number, track')
    .eq('id', traineeId)
    .maybeSingle();

  const { data: assignment } = await supabase
    .from('assignments')
    .select('slot')
    .eq('trainee_id', traineeId)
    .eq('supervisor_id', user.id)
    .maybeSingle();

  // The readable filename is rebuilt from the same rules that named the stored
  // object, so the phone saves "TP-ASSESSOR1-…" rather than a storage key. The
  // hash and result id only affect the storage path, never this name.
  const downloadName = trainee
    ? reportFileNames({
        traineeId,
        slot: (assignment?.slot as 'a1' | 'a2') ?? 'a1',
        trainee: {
          name: trainee.name,
          registrationNumber: trainee.registration_number,
          track: trainee.track as 'TP' | 'IPT',
        },
        routeCode: null,
        resultId: 'copy',
        hash: 'copy',
        now: new Date(report.generated_at as string),
      }).downloadName
    : 'tathmini-report.pdf';

  const signed = await supabase.storage
    .from('reports')
    .createSignedUrl(report.storage_path as string, 300, { download: downloadName });

  if (signed.error || !signed.data) {
    return {
      error: `Could not create a download link: ${signed.error?.message ?? 'unknown error'}`,
    };
  }

  return { url: signed.data.signedUrl };
}
