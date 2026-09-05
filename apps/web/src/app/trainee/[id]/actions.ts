'use server';

import { createClient } from '@/lib/supabase/server';
import { generateAndSendReport, type GenerateReportResult } from '@/lib/reports/generate';

export type { GenerateReportResult };

/**
 * The button on the trainee profile. Kept as a Server Action because that page
 * declares `maxDuration = 60` and so gives the work the time it needs.
 *
 * The offline drainer deliberately does NOT use this. It fires from whatever
 * page the supervisor is on — often `/offline` or `/pending`, which are client
 * components and cannot declare a duration — so it posts to
 * `/api/reports/[traineeId]` instead, which carries its own budget. Both paths
 * run the same generateAndSendReport().
 */
export async function generateReport(traineeId: string): Promise<GenerateReportResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  return generateAndSendReport(supabase, user.id, traineeId);
}
