/**
 * The transport seam for outbound e-mail.
 *
 * Brevo is the chosen provider (`reference/Tathmini Technical Architecture.dc.html`
 * — "Transactional e-mail · Brevo · well inside the free tier at this volume"),
 * but nothing above this interface knows that. Two reasons it is worth the
 * indirection:
 *
 *  1. The templates and the recipient rules are the part the College reviews,
 *     and they must be unit-testable without an API key, a network call, or a
 *     live account.
 *  2. Brevo's transactional endpoint is a single POST. Adding the whole SDK to
 *     reach it would be a dependency for no benefit — the concrete provider is
 *     a `fetch` call behind this type, so it stays out of the bundle entirely
 *     (AGENTS.md: stop and ask before any new client-bundle dependency).
 */

/** A file sent with the message. `content` is the raw PDF, base64-encoded at
 * the provider boundary, never here — keeping it a Buffer means the report
 * bytes are hashed and attached from the same value, with no re-encoding step
 * that could silently diverge from `reports.sha256_hash`. */
export interface EmailAttachment {
  filename: string;
  content: Buffer;
}

export interface EmailMessage {
  /** The trainee. One address: a result belongs to one person. */
  to: readonly string[];
  /** The assessor who marked and sent it — a visible copy, so the trainee can
   * see who assessed them and reply to a real person. */
  cc?: readonly string[];
  /** The Coordinator's standing copy. Blind on purpose: the trainee is not
   * told their result is also filed with the College, and the Coordinator's
   * mailbox is not disclosed to every trainee in the cohort. */
  bcc?: readonly string[];
  /** Where a reply should go. The assessor, not the sending mailbox: a
   * trainee replying to their result must reach the person who marked it,
   * not an unattended automation account. */
  replyTo?: string;
  subject: string;
  /** Plain text. The College reads these on mid-range Android mail clients and
   * on Outlook Web; neither renders a designed HTML mail reliably, and the
   * document that matters is the attached PDF, not the covering note. */
  text: string;
  attachments?: readonly EmailAttachment[];
}

export type SendResult =
  { ok: true; providerMessageId: string | null } | { ok: false; error: string };

export interface EmailProvider {
  send(message: EmailMessage): Promise<SendResult>;
}
