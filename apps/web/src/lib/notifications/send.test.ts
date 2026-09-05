import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendResultEmail } from './send';
import type { EmailMessage, EmailProvider, SendResult } from './types';
import type { ReportData } from '@/lib/reports/data';

function reportData(track: 'TP' | 'IPT'): ReportData {
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
      email: 'asha@example.ac.tz',
      phone: '+255 700 000 000',
      track,
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
      competent: true,
      lockedAt: '2026-09-05T10:00:00Z',
    },
    instruments: [],
  };
}

/** Just enough Supabase to satisfy this module: one users lookup and one
 * notifications insert. */
function fakeSupabase(assessor: { name: string; contact_email: string | null } | null) {
  const inserts: Record<string, unknown>[] = [];
  const client = {
    from(table: string) {
      if (table === 'users') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: assessor }) }),
          }),
        };
      }
      return {
        insert: async (row: Record<string, unknown>) => {
          inserts.push(row);
          return { error: null };
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, inserts };
}

function fakeProvider(result: SendResult = { ok: true, providerMessageId: '<id>' }) {
  const sent: EmailMessage[] = [];
  const provider: EmailProvider = {
    send: vi.fn(async (message: EmailMessage) => {
      sent.push(message);
      return result;
    }),
  };
  return { provider, sent };
}

const ENV = { RESULT_COORDINATOR_EMAIL: 'lyimos673@gmail.com' };
const ASSESSOR = { name: 'Frank Urio', contact_email: 'uriofrank16@gmail.com' };

function params(track: 'TP' | 'IPT', extra: Record<string, unknown> = {}) {
  return {
    userId: 'user-1',
    traineeId: 'trainee-1',
    data: reportData(track),
    pdf: Buffer.from('PDF'),
    filename: 'report.pdf',
    reportRef: 'TM-2026-AB12CD34',
    env: ENV,
    ...extra,
  };
}

describe('sendResultEmail', () => {
  it('TP: sends to the trainee, copies the assessor, blind-copies the Coordinator', async () => {
    const { client, inserts } = fakeSupabase(ASSESSOR);
    const { provider, sent } = fakeProvider();

    const outcome = await sendResultEmail({ supabase: client, provider, ...params('TP') });

    expect(outcome).toEqual({ status: 'sent', to: 2 });
    expect(sent[0]?.to).toEqual(['asha@example.ac.tz']);
    expect(sent[0]?.cc).toEqual(['uriofrank16@gmail.com']);
    expect(sent[0]?.bcc).toEqual(['lyimos673@gmail.com']);
    expect(sent[0]?.text).toContain('Ndugu Asha Juma Mwakalinga');
    expect(sent[0]?.attachments?.[0]?.filename).toBe('report.pdf');
    expect(inserts[0]).toMatchObject({
      trainee_id: 'trainee-1',
      channel: 'email',
      sent_by_id: 'user-1',
      provider_message_id: '<id>',
    });
  });

  it('IPT: sends to the assessor in English, never to the trainee', async () => {
    const { client } = fakeSupabase(ASSESSOR);
    const { provider, sent } = fakeProvider();

    const outcome = await sendResultEmail({ supabase: client, provider, ...params('IPT') });

    expect(outcome).toEqual({ status: 'sent', to: 2 });
    expect(sent[0]?.to).toEqual(['uriofrank16@gmail.com']);
    expect(sent[0]?.cc).toEqual(['lyimos673@gmail.com']);
    expect(sent[0]?.bcc).toEqual([]);
    expect(sent[0]?.text).toContain('Dear Sir/Madam');
    const everyone = [...sent[0]!.to, ...(sent[0]!.cc ?? []), ...(sent[0]!.bcc ?? [])];
    expect(everyone).not.toContain('asha@example.ac.tz');
  });

  it('points Reply-To at the assessor, not the sending mailbox', async () => {
    const { client } = fakeSupabase(ASSESSOR);
    const { provider, sent } = fakeProvider();
    await sendResultEmail({ supabase: client, provider, ...params('TP') });
    expect(sent[0]?.replyTo).toBe('uriofrank16@gmail.com');
  });

  it('skips, and records nothing, when the assessor has no contact address on IPT', async () => {
    const { client, inserts } = fakeSupabase({
      name: 'Mkama Maugo',
      contact_email: null,
    });
    const { provider } = fakeProvider();

    const outcome = await sendResultEmail({ supabase: client, provider, ...params('IPT') });

    expect(outcome.status).toBe('skipped');
    expect(provider.send).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
  });

  it('skips when SMTP is unconfigured, rather than throwing mid-submission', async () => {
    const { client } = fakeSupabase(ASSESSOR);
    const outcome = await sendResultEmail({
      supabase: client,
      ...params('TP', { env: { ...ENV } }),
    });
    expect(outcome.status).toBe('skipped');
    expect(outcome.status === 'skipped' && outcome.detail).toContain('SMTP_USER');
  });

  it('reports a provider failure without recording a notification', async () => {
    const { client, inserts } = fakeSupabase(ASSESSOR);
    const { provider } = fakeProvider({ ok: false, error: 'Daily user sending limit exceeded' });

    const outcome = await sendResultEmail({ supabase: client, provider, ...params('TP') });

    expect(outcome).toEqual({
      status: 'failed',
      detail: 'Daily user sending limit exceeded',
    });
    expect(inserts).toHaveLength(0);
  });

  it('still sends to the trainee when the assessor has no readable row', async () => {
    const { client } = fakeSupabase(null);
    const { provider, sent } = fakeProvider();

    const outcome = await sendResultEmail({ supabase: client, provider, ...params('TP') });

    expect(outcome.status).toBe('sent');
    expect(sent[0]?.to).toEqual(['asha@example.ac.tz']);
    expect(sent[0]?.cc).toEqual([]);
    expect(sent[0]?.replyTo).toBeUndefined();
  });
});
