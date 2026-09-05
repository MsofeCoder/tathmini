import { describe, expect, it, vi } from 'vitest';
import { createSmtpProvider, resolveSmtpConfig, type MailTransport } from './smtp';

describe('resolveSmtpConfig', () => {
  it('defaults to Gmail submission on 587 so only the credentials must be set', () => {
    const out = resolveSmtpConfig({ SMTP_USER: 'a@gmail.com', SMTP_PASSWORD: 'app-password' });
    expect(out).toEqual({
      ok: true,
      config: {
        host: 'smtp.gmail.com',
        port: 587,
        user: 'a@gmail.com',
        password: 'app-password',
        fromName: 'Tathmini',
      },
    });
  });

  it('names every missing credential at once', () => {
    expect(resolveSmtpConfig({})).toEqual({
      ok: false,
      missing: ['SMTP_USER', 'SMTP_PASSWORD'],
    });
  });

  it('accepts an explicit host, port and display name', () => {
    const out = resolveSmtpConfig({
      SMTP_HOST: 'smtp.mvttc.ac.tz',
      SMTP_PORT: '465',
      SMTP_USER: 'tathmini@mvttc.ac.tz',
      SMTP_PASSWORD: 'p',
      SMTP_FROM_NAME: 'Tathmini — MVTTC',
    });
    expect(out.ok && out.config.host).toBe('smtp.mvttc.ac.tz');
    expect(out.ok && out.config.port).toBe(465);
    expect(out.ok && out.config.fromName).toBe('Tathmini — MVTTC');
  });

  it('rejects a port that is not a number rather than dialling NaN', () => {
    const out = resolveSmtpConfig({ SMTP_USER: 'a@b.c', SMTP_PASSWORD: 'p', SMTP_PORT: 'x' });
    expect(out).toEqual({ ok: false, missing: ['SMTP_PORT'] });
  });
});

const config = {
  host: 'smtp.gmail.com',
  port: 587,
  user: 'msofecoder@gmail.com',
  password: 'app-password',
  fromName: 'Tathmini — MVTTC',
};

const message = {
  to: ['asha@example.ac.tz'],
  cc: ['p.mwakalinga@mvttc.ac.tz'],
  bcc: ['coordinator@mvttc.ac.tz'],
  replyTo: 'p.mwakalinga@mvttc.ac.tz',
  subject: 'Matokeo',
  text: 'Ndugu Asha',
  attachments: [{ filename: 'report.pdf', content: Buffer.from('PDF-BYTES') }],
};

function transport(result: Promise<{ messageId?: string }>): MailTransport {
  return { sendMail: vi.fn(() => result) };
}

/** The options the transport was handed. Fails loudly if it was never called,
 * so a silent no-send cannot pass as a passing assertion. */
function sentBy(mail: MailTransport) {
  const call = vi.mocked(mail.sendMail).mock.calls[0];
  if (!call) throw new Error('the transport was never called');
  return call[0];
}

describe('createSmtpProvider', () => {
  it('sends the report with To, Cc, Bcc, Reply-To and the PDF attached', async () => {
    const mail = transport(Promise.resolve({ messageId: '<abc@gmail>' }));
    const result = await createSmtpProvider(config, async () => mail).send(message);

    expect(result).toEqual({ ok: true, providerMessageId: '<abc@gmail>' });

    const sent = sentBy(mail);
    expect(sent.to).toBe('asha@example.ac.tz');
    expect(sent.cc).toBe('p.mwakalinga@mvttc.ac.tz');
    expect(sent.bcc).toBe('coordinator@mvttc.ac.tz');
    expect(sent.replyTo).toBe('p.mwakalinga@mvttc.ac.tz');
    expect(sent.attachments).toEqual([
      { filename: 'report.pdf', content: Buffer.from('PDF-BYTES') },
    ]);
  });

  it('sends as the authenticated mailbox, since Gmail rewrites anything else', async () => {
    const mail = transport(Promise.resolve({ messageId: 'x' }));
    await createSmtpProvider(config, async () => mail).send(message);
    const sent = sentBy(mail);
    expect(sent.from).toBe('"Tathmini — MVTTC" <msofecoder@gmail.com>');
  });

  it('omits cc, bcc and reply-to entirely when there are none', async () => {
    const mail = transport(Promise.resolve({ messageId: 'x' }));
    await createSmtpProvider(config, async () => mail).send({
      ...message,
      cc: [],
      bcc: [],
      replyTo: undefined,
    });
    const sent = sentBy(mail);
    expect(sent).not.toHaveProperty('cc');
    expect(sent).not.toHaveProperty('bcc');
    expect(sent).not.toHaveProperty('replyTo');
  });

  it('reports an SMTP rejection so a quota or a bad App Password is visible', async () => {
    const mail = transport(Promise.reject(new Error('535 Username and Password not accepted')));
    const result = await createSmtpProvider(config, async () => mail).send(message);
    expect(result).toEqual({
      ok: false,
      error: 'The e-mail was not sent: 535 Username and Password not accepted',
    });
  });

  it('never leaks a recipient address out of a multi-line SMTP error', async () => {
    const mail = transport(
      Promise.reject(new Error('550 rejected\nenvelope: asha@example.ac.tz\nstack…')),
    );
    const result = await createSmtpProvider(config, async () => mail).send(message);
    expect(result).toEqual({ ok: false, error: 'The e-mail was not sent: 550 rejected' });
    expect(result.ok === false && result.error).not.toContain('asha@example.ac.tz');
  });

  it('refuses to send with no recipient rather than calling the transport', async () => {
    const mail = transport(Promise.resolve({ messageId: 'x' }));
    const result = await createSmtpProvider(config, async () => mail).send({
      ...message,
      to: [],
    });
    expect(result).toEqual({ ok: false, error: 'No recipient for this report.' });
    expect(mail.sendMail).not.toHaveBeenCalled();
  });

  it('treats an accepted send with no message id as sent', async () => {
    const mail = transport(Promise.resolve({}));
    const result = await createSmtpProvider(config, async () => mail).send(message);
    expect(result).toEqual({ ok: true, providerMessageId: null });
  });
});
