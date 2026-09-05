import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReportData } from '@/lib/reports/data';
import type { EmailProvider } from './types';
import { isRealAddress, resolveResultRecipients } from './recipients';
import { renderCollegeResultEmail, renderTraineeResultEmail } from './templates';
import { createSmtpProvider, resolveSmtpConfig } from './smtp';

/**
 * Sends one stored result report and records the attempt.
 *
 * Called after the PDF is stored, never before, and its failure never fails
 * the surrounding action. The report and the marks behind it are the record;
 * the e-mail is a delivery of that record. Losing the delivery must not lose
 * the record, and a supervisor standing in a workshop with bad signal must be
 * told "saved, not sent" rather than "failed" — the difference decides whether
 * they mark the trainee again.
 *
 * Hence three outcomes rather than a boolean: `sent`, `skipped` (correctly
 * nothing to send, or not configured to send), and `failed` (the provider
 * refused or was unreachable).
 */
export type EmailOutcome =
  | { status: 'sent'; to: number }
  | { status: 'skipped'; detail: string }
  | { status: 'failed'; detail: string };

export interface SendResultEmailParams {
  supabase: SupabaseClient;
  userId: string;
  traineeId: string;
  data: ReportData;
  pdf: Buffer;
  /** The readable file name the supervisor's own download uses, so the
   * attachment and the saved copy are recognisably the same document. */
  filename: string;
  reportRef: string;
  /** Injected by the tests. Production resolves an SMTP provider from env. */
  provider?: EmailProvider;
  env?: Readonly<Record<string, string | undefined>>;
}

export async function sendResultEmail({
  supabase,
  userId,
  traineeId,
  data,
  pdf,
  filename,
  reportRef,
  provider,
  env = process.env,
}: SendResultEmailParams): Promise<EmailOutcome> {
  // The caller's own row — readable under `users_select` because
  // `id = auth.uid()`. Never a client payload, and never a lookup of anyone
  // else: a supervisor cannot read another user's row at all.
  const { data: assessor } = await supabase
    .from('users')
    .select('name, contact_email')
    .eq('id', userId)
    .maybeSingle();

  const assessorName = assessor?.name ?? 'Your assessor';
  // contact_email, never email. `users.email` is the sign-in identifier — a
  // synthetic <firstname>.<lastname>@tathmini.internal address that mirrors
  // auth.users.email and that nothing is ever sent to. The reachable address
  // lives in contact_email (migration 0017_users_contact_email), and is null
  // for most accounts.
  const assessorEmail = (assessor?.contact_email as string | null) ?? null;

  const recipients = resolveResultRecipients(data.trainee, assessorEmail, env);
  if (!recipients.ok) {
    return { status: 'skipped', detail: recipients.detail };
  }

  const context = { assessorName, reportRef };
  // IPT goes to the assessor, so it reads as a staff document in English; TP
  // goes to the trainee, in Swahili. Addressing a supervisor as "Ndugu
  // <trainee name>" would be plainly wrong.
  const body =
    data.trainee.track === 'IPT'
      ? renderCollegeResultEmail(data, context)
      : renderTraineeResultEmail(data, context);

  let transport = provider;
  if (!transport) {
    const config = resolveSmtpConfig(env);
    if (!config.ok) {
      return {
        status: 'skipped',
        detail: `E-mail is not configured (${config.missing.join(', ')}).`,
      };
    }
    transport = createSmtpProvider(config.config);
  }

  const result = await transport.send({
    to: recipients.recipients.to,
    cc: recipients.recipients.cc,
    bcc: recipients.recipients.bcc,
    // A reply reaches the person who marked the assessment, not the unattended
    // mailbox the system sends from.
    ...(isRealAddress(assessorEmail) ? { replyTo: assessorEmail!.trim() } : {}),
    subject: body.subject,
    text: body.text,
    attachments: [{ filename, content: pdf }],
  });

  if (!result.ok) {
    return { status: 'failed', detail: result.error };
  }

  // Recorded after a confirmed send, so the table means "this went out", not
  // "this was attempted". A failed insert does not un-send the mail, so it
  // must not turn a delivered result into a reported failure — the row is the
  // audit trail, and a missing one is a smaller problem than a supervisor
  // re-sending a report that already arrived.
  await supabase.from('notifications').insert({
    trainee_id: traineeId,
    channel: 'email',
    sent_by_id: userId,
    provider_message_id: result.providerMessageId,
  });

  return {
    status: 'sent',
    to: recipients.recipients.to.length + recipients.recipients.cc.length,
  };
}
