import type { EmailMessage, EmailProvider, SendResult } from './types';

/**
 * Brevo transactional e-mail, over `fetch`.
 *
 * The provider was chosen in `reference/Tathmini Technical Architecture.dc.html`
 * ("Transactional e-mail · Brevo · well inside the free tier at this volume").
 * Reaching it is one POST, so `@getbrevo/brevo` is not worth a dependency —
 * AGENTS.md asks before any new client-bundle dependency, and this file is
 * server-only regardless: `BREVO_API_KEY` must never reach a browser.
 *
 * Every failure is returned, never thrown. A send that fails must not lose the
 * stored report or the submitted marks behind it — the caller records the
 * attempt and tells the supervisor the result was saved but not e-mailed.
 */

const ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

export interface BrevoConfig {
  apiKey: string;
  senderEmail: string;
  senderName: string;
}

export type ConfigOutcome =
  | { ok: true; config: BrevoConfig }
  | { ok: false; missing: readonly string[] };

export function resolveBrevoConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ConfigOutcome {
  const apiKey = env.BREVO_API_KEY?.trim();
  const senderEmail = env.BREVO_SENDER_EMAIL?.trim();
  const senderName = env.BREVO_SENDER_NAME?.trim() || 'Tathmini';

  const missing: string[] = [];
  if (!apiKey) missing.push('BREVO_API_KEY');
  if (!senderEmail) missing.push('BREVO_SENDER_EMAIL');
  if (missing.length > 0) return { ok: false, missing };

  return { ok: true, config: { apiKey: apiKey!, senderEmail: senderEmail!, senderName } };
}

/** Brevo's documented cap on total attachment size is 10 MB. A VETA report is
 * a few hundred KB, so exceeding this means something is wrong upstream —
 * catch it here rather than sending a request that will be rejected. */
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export function createBrevoProvider(
  config: BrevoConfig,
  fetchImpl: typeof fetch = fetch,
): EmailProvider {
  return {
    async send(message: EmailMessage): Promise<SendResult> {
      const attachmentBytes = (message.attachments ?? []).reduce(
        (total, a) => total + a.content.byteLength,
        0,
      );
      if (attachmentBytes > MAX_ATTACHMENT_BYTES) {
        return { ok: false, error: 'The report is too large to send as an attachment.' };
      }

      const body = {
        sender: { email: config.senderEmail, name: config.senderName },
        to: message.to.map((email) => ({ email })),
        ...(message.cc?.length ? { cc: message.cc.map((email) => ({ email })) } : {}),
        ...(message.bcc?.length ? { bcc: message.bcc.map((email) => ({ email })) } : {}),
        subject: message.subject,
        textContent: message.text,
        ...(message.attachments?.length
          ? {
              attachment: message.attachments.map((a) => ({
                name: a.filename,
                content: a.content.toString('base64'),
              })),
            }
          : {}),
      };

      let response: Response;
      try {
        response = await fetchImpl(ENDPOINT, {
          method: 'POST',
          headers: {
            'api-key': config.apiKey,
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify(body),
        });
      } catch {
        // Network failure. Deliberately does not echo the thrown error: it can
        // carry the request, and the request carries a trainee's e-mail address
        // (AGENTS.md — never log a trainee's e-mail).
        return { ok: false, error: 'Could not reach the e-mail service.' };
      }

      if (!response.ok) {
        // Brevo returns {code, message}. The message names the misconfiguration
        // ("Sender not valid", "unauthorized") and never echoes a recipient.
        let detail = `HTTP ${response.status}`;
        try {
          const parsed: unknown = await response.json();
          if (parsed && typeof parsed === 'object' && 'message' in parsed) {
            detail = String((parsed as { message: unknown }).message);
          }
        } catch {
          // Non-JSON error body; the status alone is what we report.
        }
        return { ok: false, error: `The e-mail service refused the message: ${detail}` };
      }

      let providerMessageId: string | null = null;
      try {
        const parsed: unknown = await response.json();
        if (parsed && typeof parsed === 'object' && 'messageId' in parsed) {
          providerMessageId = String((parsed as { messageId: unknown }).messageId);
        }
      } catch {
        // Accepted, but the id was unreadable. The send still happened, so
        // report success — `notifications.provider_message_id` is nullable
        // precisely because a provider may not give one back.
      }

      return { ok: true, providerMessageId };
    },
  };
}
