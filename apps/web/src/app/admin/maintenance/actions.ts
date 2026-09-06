'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminWriter, type ActionResult } from '@/lib/admin/session';

/**
 * Removing the test rows from the live register.
 *
 * The delete itself happens in Postgres, in `purge_test_trainees()` (migration
 * 0029): `delete on trainees` is revoked from every signed-in role because it
 * cascades to marks, and that revocation stays. The function is the one narrow
 * exception — it can only ever remove rows matching the documented test-data
 * predicate, so this button cannot delete a real trainee even if it is pressed
 * by mistake.
 *
 * Order is deliberate. The database rows go first and the PDF files second: a
 * few unreferenced files in a bucket are harmless, whereas rows pointing at
 * files that no longer exist are a register that lies. If the file sweep fails,
 * the purge is still reported as done, with the files named.
 */
export async function purgeTestTrainees(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await requireAdminWriter();
  if (!auth.ok) return auth;
  const supabase = auth.session.supabase;

  // The form's own confirmation field. A Server Action is a POST endpoint like
  // any other, and this one is irreversible — requiring the token means a
  // request that did not come from the confirmed button does nothing.
  if (formData.get('confirm') !== 'purge-test-data') {
    return { ok: false, error: 'Confirmation missing — nothing was deleted.' };
  }

  // Collected BEFORE the delete: once the rows are gone, so is any record of
  // where their files were.
  const { data: testTrainees } = await supabase
    .from('trainees')
    .select('id, registration_number, route_id, routes(code)')
    .or('registration_number.like.TEST-TP-%,registration_number.like.TEST-IPT-%');

  const { data: testRoute } = await supabase
    .from('routes')
    .select('id')
    .eq('code', 'TEST ROUTE')
    .maybeSingle();

  const ids = new Set((testTrainees ?? []).map((t) => t.id as string));
  if (testRoute) {
    const { data: onTestRoute } = await supabase
      .from('trainees')
      .select('id')
      .eq('route_id', testRoute.id);
    for (const row of onTestRoute ?? []) ids.add(row.id as string);
  }

  const storagePaths: string[] = [];
  if (ids.size > 0) {
    const idList = [...ids];
    for (let i = 0; i < idList.length; i += 100) {
      const { data: reports } = await supabase
        .from('reports')
        .select('storage_path')
        .in('trainee_id', idList.slice(i, i + 100));
      for (const report of reports ?? []) storagePaths.push(report.storage_path as string);
    }
  }

  const { data, error } = await supabase.rpc('purge_test_trainees');

  if (error) {
    // The function does not exist yet — migration 0029 has not been applied.
    // Said plainly, because "could not find the function" is not something an
    // administrator can act on.
    if (error.code === 'PGRST202' || error.message.includes('purge_test_trainees')) {
      return {
        ok: false,
        error:
          'This is not enabled yet: migration 0029 has not been applied to the database. Nothing was deleted.',
      };
    }
    if (error.code === '42501') {
      return { ok: false, error: 'Only a Super Administrator may remove test data.' };
    }
    return { ok: false, error: `The purge was refused: ${error.message}` };
  }

  const result = Array.isArray(data) ? data[0] : data;
  const trainees = Number(result?.trainees_deleted ?? 0);
  const marks = Number(result?.marks_deleted ?? 0);
  const reports = Number(result?.reports_deleted ?? 0);

  let fileNote = '';
  if (storagePaths.length > 0) {
    const { error: storageError } = await supabase.storage.from('reports').remove(storagePaths);
    fileNote = storageError
      ? ` The register is clean, but ${storagePaths.length} report ${
          storagePaths.length === 1 ? 'file' : 'files'
        } could not be removed from storage: ${storageError.message}`
      : ` ${storagePaths.length} report ${storagePaths.length === 1 ? 'file was' : 'files were'} removed from storage.`;
  }

  revalidatePath('/admin');
  revalidatePath('/admin/trainees');
  revalidatePath('/admin/results');
  revalidatePath('/admin/maintenance');

  if (trainees === 0) {
    return { ok: true, message: 'Nothing to remove — there are no test rows in the register.' };
  }

  return {
    ok: true,
    message: `Removed ${trainees} test ${trainees === 1 ? 'trainee' : 'trainees'}, ${marks} ${
      marks === 1 ? 'mark' : 'marks'
    } and ${reports} report ${reports === 1 ? 'record' : 'records'}.${fileNote} The purge is on the audit trail.`,
  };
}
