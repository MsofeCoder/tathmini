import { describe, expect, it, vi } from 'vitest';
import { renderCollegeResultEmail, renderTraineeResultEmail } from './templates';
import { isRealAddress, resolveResultRecipients } from './recipients';
import { createBrevoProvider, resolveBrevoConfig } from './brevo';
import type { ReportData } from '@/lib/reports/data';

function data(overrides: {
  track?: 'TP' | 'IPT';
  email?: string | null;
  lockedAt?: string | null;
  competent?: boolean | null;
}): ReportData {
  return {
    trainee: {
      name: 'Asha Juma Mwakalinga',
      registrationNumber: 'MVTTC/TP/2026/014',
      occupation: 'Electrical Installation',
      course: 'TC-TVTE',
      modeOfStudy: 'Full time',
      institution: 'Morogoro VTC',
      region: 'Morogoro',
      district: 'Morogoro Urban',
      email: overrides.email === undefined ? 'asha@example.ac.tz' : overrides.email,
      phone: '+255 700 000 000',
      track: overrides.track ?? 'TP',
    },
    result: {
      id: 'r1',
      theoryTotal: 40,
      practicalTotal: 45,
      total: 85,
      max: 100,
      pct: 85,
      grade: 'A',
      gpa: 5,
      classOfAward: 'First Class',
      competent: overrides.competent === undefined ? true : overrides.competent,
      lockedAt: overrides.lockedAt === undefined ? '2026-09-05T10:00:00Z' : overrides.lockedAt,
    },
    instruments: [],
  };
}

const ctx = { assessorName: 'Eng. P. Mwakalinga', reportRef: 'TM-2026-AB12CD34' };

describe('renderTraineeResultEmail', () => {
  it('addresses the trainee in Swahili, personalised from their own record', () => {
    const mail = renderTraineeResultEmail(data({}), ctx);
    expect(mail.text).toContain('Ndugu Asha Juma Mwakalinga');
    expect(mail.text).toContain('Habari Asha');
    expect(mail.text).toContain('MVTTC/TP/2026/014');
    expect(mail.text).toContain('TM-2026-AB12CD34');
  });

  it('states no mark, grade or verdict — the attached PDF is the document', () => {
    const mail = renderTraineeResultEmail(data({}), ctx);
    const body = `${mail.subject}\n${mail.text}`;
    expect(body).not.toContain('85');
    expect(body).not.toContain('First Class');
    expect(body).not.toMatch(/competent/i);
    expect(body).not.toMatch(/daraja/i);
  });
});

describe('renderCollegeResultEmail', () => {
  it('states the verdict once both assessors are in', () => {
    expect(renderCollegeResultEmail(data({}), ctx).text).toContain('Verdict: Competent');
    expect(renderCollegeResultEmail(data({ competent: false }), ctx).text).toContain(
      'Verdict: Not Competent',
    );
  });

  it('will not announce a final verdict on a half-assessed result', () => {
    const text = renderCollegeResultEmail(data({ lockedAt: null, competent: true }), ctx).text;
    expect(text).toContain('Provisional');
    expect(text).not.toContain('Verdict: Competent');
  });

  it('never writes "Standard Attained"', () => {
    const mail = renderCollegeResultEmail(data({}), ctx);
    expect(`${mail.subject}\n${mail.text}`).not.toContain('Standard Attained');
  });

  it('keeps marks out of the subject line', () => {
    expect(renderCollegeResultEmail(data({}), ctx).subject).not.toContain('85');
  });
});

const COORD = { RESULT_COORDINATOR_EMAIL: 'tp.coordinator@mvttc.ac.tz' };
const PLACEHOLDER = 'mkama.maugo@tathmini.internal';
const ASSESSOR = 'uriofrank16@gmail.com';

describe('resolveResultRecipients', () => {
  it('refuses to send at all when the Coordinator mailbox is unconfigured', () => {
    const out = resolveResultRecipients({ track: 'TP', email: 'a@b.tz' }, ASSESSOR, {});
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.reason).toBe('unconfigured');
    expect(out.ok === false && out.detail).toContain('RESULT_COORDINATOR_EMAIL');
  });

  describe('TP - to the trainee', () => {
    it('puts the trainee in To, the assessor in Cc and the Coordinator in Bcc', () => {
      const out = resolveResultRecipients(
        { track: 'TP', email: 'asha@example.ac.tz' },
        ASSESSOR,
        COORD,
      );
      expect(out).toEqual({
        ok: true,
        recipients: {
          to: ['asha@example.ac.tz'],
          cc: [ASSESSOR],
          bcc: ['tp.coordinator@mvttc.ac.tz'],
        },
      });
    });

    it('still reaches the trainee when the assessor address is a placeholder', () => {
      const out = resolveResultRecipients({ track: 'TP', email: 'a@b.tz' }, PLACEHOLDER, COORD);
      expect(out.ok && out.recipients.to).toEqual(['a@b.tz']);
      expect(out.ok && out.recipients.cc).toEqual([]);
    });

    it('reports a TP record with no address as not-emailable, not as an error', () => {
      for (const email of [null, '   ']) {
        const out = resolveResultRecipients({ track: 'TP', email }, ASSESSOR, COORD);
        expect(out.ok).toBe(false);
        expect(out.ok === false && out.reason).toBe('not-emailable');
      }
    });
  });

  describe('IPT - to the assessor, never the trainee', () => {
    it('puts the assessor in To and the Coordinator in Cc, with no Bcc', () => {
      const out = resolveResultRecipients({ track: 'IPT', email: null }, ASSESSOR, COORD);
      expect(out).toEqual({
        ok: true,
        recipients: { to: [ASSESSOR], cc: ['tp.coordinator@mvttc.ac.tz'], bcc: [] },
      });
    });

    it('never e-mails an IPT trainee, even when the record happens to carry an address', () => {
      const out = resolveResultRecipients(
        { track: 'IPT', email: 'trainee@example.ac.tz' },
        ASSESSOR,
        COORD,
      );
      const all = out.ok ? [...out.recipients.to, ...out.recipients.cc, ...out.recipients.bcc] : [];
      expect(all).not.toContain('trainee@example.ac.tz');
    });

    it('cannot send at all when the assessor address is still a placeholder', () => {
      const out = resolveResultRecipients({ track: 'IPT', email: null }, PLACEHOLDER, COORD);
      expect(out).toEqual({
        ok: false,
        reason: 'not-emailable',
        detail: 'This assessor has no e-mail address on record.',
      });
    });
  });

  describe('isRealAddress', () => {
    it('rejects the roster placeholders that would bounce', () => {
      expect(isRealAddress(PLACEHOLDER)).toBe(false);
      expect(isRealAddress('Adam.Msofe@Tathmini.Internal')).toBe(false);
      expect(isRealAddress(null)).toBe(false);
      expect(isRealAddress('  ')).toBe(false);
    });

    it('accepts a real mailbox', () => {
      expect(isRealAddress(ASSESSOR)).toBe(true);
    });
  });
});

describe('resolveBrevoConfig', () => {
  it('names every missing variable at once', () => {
    expect(resolveBrevoConfig({})).toEqual({
      ok: false,
      missing: ['BREVO_API_KEY', 'BREVO_SENDER_EMAIL'],
    });
  });

  it('defaults only the sender name', () => {
    const out = resolveBrevoConfig({ BREVO_API_KEY: 'k', BREVO_SENDER_EMAIL: 's@mvttc.ac.tz' });
    expect(out).toEqual({
      ok: true,
      config: { apiKey: 'k', senderEmail: 's@mvttc.ac.tz', senderName: 'Tathmini' },
    });
  });
});

const config = { apiKey: 'k', senderEmail: 'tathmini@mvttc.ac.tz', senderName: 'Tathmini' };

function accepted(body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: 201 }));
}

const message = {
  to: ['asha@example.ac.tz'],
  cc: ['p.mwakalinga@mvttc.ac.tz'],
  bcc: ['tp.coordinator@mvttc.ac.tz'],
  subject: 'Matokeo',
  text: 'Ndugu Asha',
  attachments: [{ filename: 'report.pdf', content: Buffer.from('PDF-BYTES') }],
};

describe('createBrevoProvider', () => {
  it('sends To, Cc, Bcc and a base64 attachment, and returns the provider id', async () => {
    const fetchImpl = accepted({ messageId: '<abc@brevo>' });
    const result = await createBrevoProvider(config, fetchImpl).send(message);

    expect(result).toEqual({ ok: true, providerMessageId: '<abc@brevo>' });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect((init.headers as Record<string, string>)['api-key']).toBe('k');

    const sent = JSON.parse(init.body as string);
    expect(sent.sender).toEqual({ email: 'tathmini@mvttc.ac.tz', name: 'Tathmini' });
    expect(sent.to).toEqual([{ email: 'asha@example.ac.tz' }]);
    expect(sent.cc).toEqual([{ email: 'p.mwakalinga@mvttc.ac.tz' }]);
    expect(sent.bcc).toEqual([{ email: 'tp.coordinator@mvttc.ac.tz' }]);
    expect(sent.attachment).toEqual([
      { name: 'report.pdf', content: Buffer.from('PDF-BYTES').toString('base64') },
    ]);
  });

  it('omits cc and bcc entirely when there are none', async () => {
    const fetchImpl = accepted({ messageId: 'x' });
    await createBrevoProvider(config, fetchImpl).send({ ...message, cc: [], bcc: [] });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const sent = JSON.parse(init.body as string);
    expect(sent).not.toHaveProperty('cc');
    expect(sent).not.toHaveProperty('bcc');
  });

  it('surfaces a refusal with the provider explanation', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ message: 'Sender not valid' }), { status: 400 }),
    );
    const result = await createBrevoProvider(config, fetchImpl).send(message);
    expect(result).toEqual({
      ok: false,
      error: 'The e-mail service refused the message: Sender not valid',
    });
  });

  it('never echoes a recipient address when the network fails', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('connect ECONNREFUSED asha@example.ac.tz');
    });
    const result = await createBrevoProvider(config, fetchImpl).send(message);
    expect(result).toEqual({ ok: false, error: 'Could not reach the e-mail service.' });
  });

  it('refuses an attachment over the provider limit rather than sending it', async () => {
    const fetchImpl = accepted({ messageId: 'x' });
    const result = await createBrevoProvider(config, fetchImpl).send({
      ...message,
      attachments: [{ filename: 'huge.pdf', content: Buffer.alloc(11 * 1024 * 1024) }],
    });
    expect(result).toEqual({
      ok: false,
      error: 'The report is too large to send as an attachment.',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('treats an accepted send with an unreadable body as sent', async () => {
    const fetchImpl = vi.fn(async () => new Response('not json', { status: 201 }));
    const result = await createBrevoProvider(config, fetchImpl).send(message);
    expect(result).toEqual({ ok: true, providerMessageId: null });
  });
});
