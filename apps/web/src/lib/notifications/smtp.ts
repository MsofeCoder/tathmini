import type { EmailMessage, EmailProvider, SendResult } from './types';

/**
 * SMTP delivery, configured for Gmail's own submission service.
 *
 * The College chose this over a transactional ESP (2026-09-05): the three
 * sending mailboxes already exist and it costs nothing. It works properly
 * *because* the From address and the SMTP server belong to the same operator —
 * Google DKIM-signs mail sent as `you@gmail.com` through `smtp.gmail.com`, so
 * it is DMARC-aligned on arrival. The same address relayed through a
 * third-party ESP would not be: nobody can add DKIM records to `gmail.com`.
 * That distinction is the whole reason this file exists rather than `brevo.ts`.
 *
 * Two consequences the College accepted, recorded so they are not rediscovered
 * as bugs:
 *
 *  1. **The From address is visibly a personal mailbox.** Gmail rewrites the
 *     From header to the authenticated account unless the address is a
 *     verified "Send mail as" alias, so a VETA result arrives from a
 *     `@gmail.com` address. `SMTP_FROM_NAME` puts "Tathmini — MVTTC" in front
 *     of it, which is as far as presentation can be pushed without a College
 *     domain.
 *  2. **A consumer Gmail account has a daily send limit** (Google documents
 *     roughly 500 recipients per day; a Workspace account is higher). Each
 *     result e-mail counts three recipients — trainee, Cc, Bcc. At ~300
 *     trainees that is comfortable, but it is a ceiling, not a guarantee, and
 *     a rejected send must never be mistaken for a delivered one. Hence every
 *     failure below is returned and recorded, never swallowed.
 *
 * `brevo.ts` is kept alongside this deliberately. Both satisfy `EmailProvider`,
 * so moving to a College domain later is a configuration change at the call
 * site, not a rewrite of the templates or the recipient rules.
 */

/** The subset of nodemailer's transport this code uses. Declared structurally
 * so the tests — and the type checker — need nothing installed. */
export interface MailTransport {
  sendMail(options: {
    from: string;
    to: string;
    cc?: string;
    bcc?: string;
    replyTo?: string;
    subject: string;
    text: string;
    attachments?: { filename: string; content: Buffer }[];
  }): Promise<{ messageId?: string }>;
}

export interface SmtpConfig {
  host: string;
  port: number;
  /** The authenticated mailbox. Also the From address: Gmail rewrites anything
   * else, so sending as something this account cannot prove is not an option. */
  user: string;
  password: string;
  fromName: string;
}

export type SmtpConfigOutcome =
  { ok: true; config: SmtpConfig } | { ok: false; missing: readonly string[] };

/**
 * Reads SMTP settings from the environment.
 *
 * `SMTP_PASSWORD` is a Google **App Password**, not the account password.
 * Google withdrew basic password authentication for third-party clients in
 * 2022, so an App Password (which requires 2-Step Verification on the account)
 * is the only thing that will authenticate here. A wrong one fails at login
 * with "Username and Password not accepted", which is the error the caller
 * will see reported.
 */
export function resolveSmtpConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): SmtpConfigOutcome {
  const host = env.SMTP_HOST?.trim() || 'smtp.gmail.com';
  const user = env.SMTP_USER?.trim();
  const password = env.SMTP_PASSWORD?.trim();
  const fromName = env.SMTP_FROM_NAME?.trim() || 'Tathmini';

  // 587 with STARTTLS is Gmail's documented default and the one that survives
  // restrictive outbound firewalls most often; 465 (implicit TLS) is selected
  // by setting SMTP_PORT explicitly.
  const port = Number(env.SMTP_PORT?.trim() || '587');

  const missing: string[] = [];
  if (!user) missing.push('SMTP_USER');
  if (!password) missing.push('SMTP_PASSWORD');
  if (!Number.isInteger(port) || port <= 0) missing.push('SMTP_PORT');
  if (missing.length > 0) return { ok: false, missing };

  return { ok: true, config: { host, port, user: user!, password: password!, fromName } };
}

/**
 * Builds the nodemailer transport.
 *
 * Imported dynamically, for the reason `pdf.ts` imports `@sparticuz/chromium`
 * that way: it must never be pulled into a bundle that could reach the client.
 * `SMTP_PASSWORD` is a live credential to a mailbox that sends on the
 * College's behalf, and nodemailer reaches for `net`/`tls`/`dns`, none of
 * which exist in a browser. Keeping the import inside the function also means
 * the tests below run without the package installed.
 */
async function defaultTransport(config: SmtpConfig): Promise<MailTransport> {
  const nodemailer = (await import('nodemailer')).default;
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    // Implicit TLS on 465; STARTTLS (upgraded in-band, still encrypted) on 587.
    secure: config.port === 465,
    auth: { user: config.user, pass: config.password },
  }) as unknown as MailTransport;
}

export function createSmtpProvider(
  config: SmtpConfig,
  transportFactory: (config: SmtpConfig) => Promise<MailTransport> = defaultTransport,
): EmailProvider {
  return {
    async send(message: EmailMessage): Promise<SendResult> {
      if (message.to.length === 0) {
        return { ok: false, error: 'No recipient for this report.' };
      }

      let transport: MailTransport;
      try {
        transport = await transportFactory(config);
      } catch {
        return { ok: false, error: 'The e-mail service is not available.' };
      }

      try {
        const info = await transport.sendMail({
          // Gmail rewrites a From it cannot authenticate, so the address is
          // always the logged-in mailbox and only the display name is ours.
          from: `"${config.fromName}" <${config.user}>`,
          to: message.to.join(', '),
          ...(message.cc?.length ? { cc: message.cc.join(', ') } : {}),
          ...(message.bcc?.length ? { bcc: message.bcc.join(', ') } : {}),
          ...(message.replyTo ? { replyTo: message.replyTo } : {}),
          subject: message.subject,
          text: message.text,
          ...(message.attachments?.length
            ? {
                attachments: message.attachments.map((a) => ({
                  filename: a.filename,
                  content: a.content,
                })),
              }
            : {}),
        });
        return { ok: true, providerMessageId: info.messageId ?? null };
      } catch (error) {
        // SMTP rejections name the cause ("Username and Password not
        // accepted", "Daily user sending limit exceeded") and the College
        // needs to see which. But a nodemailer error can carry the envelope,
        // and the envelope carries the trainee's address, so only the first
        // line is surfaced — never the object (AGENTS.md: never log a
        // trainee's e-mail).
        const first = String(error instanceof Error ? error.message : error).split('\n')[0];
        return { ok: false, error: `The e-mail was not sent: ${first}` };
      }
    },
  };
}
