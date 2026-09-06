'use server';

import { revalidatePath } from 'next/cache';
import { validateContactEmail } from '@/lib/admin/validation';
import { isUuid } from '@/lib/admin/validation';
import { requireAdminWriter, type ActionResult } from '@/lib/admin/session';

/**
 * Account edits the console is allowed to make.
 *
 * Two, deliberately. Everything else about an account — creating it, setting
 * or rotating its password — needs the Supabase Auth Admin API and therefore
 * the service-role key, which bypasses RLS entirely and is kept out of the
 * deployed app (AGENTS.md). Those stay in packages/db/src/scripts, run by a
 * person on their own machine.
 *
 * What is here writes to `users` through the administrator's own session, so
 * `users_admin_write` is what actually permits it. A coordinator reaching
 * this code is refused twice: once by requireAdminWriter() for a readable
 * message, and once by Postgres, which is the check that matters.
 */

export async function updateContactEmail(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await requireAdminWriter();
  if (!auth.ok) return auth;

  const userId = String(formData.get('userId') ?? '');
  if (!isUuid(userId)) return { ok: false, error: 'That account could not be identified.' };

  const checked = validateContactEmail(String(formData.get('contactEmail') ?? ''));
  if (!checked.ok) return { ok: false, error: checked.error };

  /**
   * `contact_email` only. Never `email`: that column is the sign-in
   * identifier mirroring auth.users.email, and writing a real address into
   * it breaks sign-in for that person — migration 0022 did exactly that and
   * 0027 had to undo it across the whole staff list.
   */
  const { error } = await auth.session.supabase
    .from('users')
    .update({ contact_email: checked.value })
    .eq('id', userId);

  if (error) return { ok: false, error: `The change was refused: ${error.message}` };

  revalidatePath('/admin/users');
  revalidatePath('/admin');
  return {
    ok: true,
    message: checked.value ? `Address saved as ${checked.value}.` : 'Address cleared.',
  };
}

export async function setAccountActive(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await requireAdminWriter();
  if (!auth.ok) return auth;

  const userId = String(formData.get('userId') ?? '');
  const active = String(formData.get('active') ?? '') === 'true';
  if (!isUuid(userId)) return { ok: false, error: 'That account could not be identified.' };

  // Locking yourself out of the console is not a recoverable mistake from
  // inside the console.
  if (userId === auth.session.userId) {
    return { ok: false, error: 'You cannot deactivate the account you are signed in with.' };
  }

  if (!active) {
    /**
     * The last administrator standing. Deactivating them would leave the
     * College with no way into this console at all — recovery would mean a
     * service-role script, which is precisely the thing the console exists
     * to avoid needing.
     */
    const { data: admins } = await auth.session.supabase
      .from('users')
      .select('id')
      .eq('role', 'super_admin')
      .eq('active', true);

    const remaining = (admins ?? []).filter((row) => row.id !== userId);
    const target = (admins ?? []).some((row) => row.id === userId);
    if (target && remaining.length === 0) {
      return {
        ok: false,
        error:
          'That is the last active administrator account — deactivating it would lock everyone out.',
      };
    }
  }

  const { error } = await auth.session.supabase.from('users').update({ active }).eq('id', userId);
  if (error) return { ok: false, error: `The change was refused: ${error.message}` };

  revalidatePath('/admin/users');
  revalidatePath('/admin');
  return {
    ok: true,
    message: active
      ? 'Account reactivated — they can sign in again.'
      : 'Account deactivated. They cannot sign in, and anything they already submitted stays on the record.',
  };
}
