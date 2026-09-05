import type { ReportData } from '@/lib/reports/data';
import type { EmailMessage } from './types';

/**
 * Covering notes for the result report e-mail. Two audiences, two registers.
 *
 * Neither template states a mark. The PDF is the document — it reproduces the
 * VETA form field for field, carries the report reference and the SHA-256 the
 * `reports` row records, and is the thing an auditor reads. A covering note
 * that restates the numbers creates a second, unversioned copy of a published
 * figure that can drift from the file attached beneath it; worse, it puts a
 * trainee's marks in a mail subject line and in every mail-server log between
 * here and the recipient (AGENTS.md: never log a trainee's marks). The
 * verdict — the one fact a recipient must be able to act on without opening an
 * attachment — is the deliberate exception, and only in the College note.
 *
 * Copy register per CONTEXT.md: simple Tanzanian institutional English for
 * College staff, Swahili for the trainee, personalised from their own record.
 */

const COLLEGE = 'Chuo cha Ualimu wa Elimu ya Ufundi Morogoro (MVTTC)';

function trackLabelEnglish(track: 'TP' | 'IPT'): string {
  return track === 'IPT' ? 'Industrial Practical Training (IPT)' : 'Teaching Practice (TP)';
}

function trackLabelSwahili(track: 'TP' | 'IPT'): string {
  return track === 'IPT'
    ? 'Mafunzo kwa Vitendo Kiwandani (IPT)'
    : 'Mafunzo ya Ualimu kwa Vitendo (TP)';
}

/** Competent / Not Competent — never "Standard Attained" (AGENTS.md). Null
 * while only one assessor has submitted: the verdict on a single-assessor
 * report is that assessor's own, and the official one is the average of both,
 * so an unlocked result must not be announced as final. */
function verdictEnglish(data: ReportData): string {
  if (data.result.lockedAt === null) {
    return 'Provisional — one assessor of two has submitted so far.';
  }
  return data.result.competent ? 'Competent' : 'Not Competent';
}

export interface ResultEmailContext {
  /** The supervisor who generated this report. */
  assessorName: string;
  /** `TM-YYYY-XXXXXXXX`, as printed on the PDF and stored with the report. */
  reportRef: string;
}

/**
 * The note that goes to the three named College recipient roles.
 *
 * States the verdict and identifies the trainee, the assessor and the report
 * reference, so the mail is actionable and filable without opening the PDF.
 */
export function renderCollegeResultEmail(
  data: ReportData,
  context: ResultEmailContext,
): Omit<EmailMessage, 'to'> {
  const { trainee } = data;
  const subject = `${trackLabelEnglish(trainee.track)} result — ${trainee.name}${
    trainee.registrationNumber ? ` (${trainee.registrationNumber})` : ''
  } — ${context.reportRef}`;

  const text = [
    'Dear Sir/Madam,',
    '',
    `The ${trackLabelEnglish(trainee.track)} assessment result for the trainee named below is attached as a PDF report.`,
    '',
    'TRAINEE',
    `  Name: ${trainee.name}`,
    `  Registration number: ${trainee.registrationNumber ?? '—'}`,
    `  Occupation: ${trainee.occupation}`,
    `  Course: ${trainee.course}`,
    `  Centre: ${trainee.institution}${trainee.district ? `, ${trainee.district}` : ''}${
      trainee.region ? `, ${trainee.region}` : ''
    }`,
    '',
    'ASSESSMENT',
    `  Assessed by: ${context.assessorName}`,
    `  Verdict: ${verdictEnglish(data)}`,
    `  Report reference: ${context.reportRef}`,
    '',
    'The attached report reproduces the VETA assessment form in full, including',
    'each criterion, the marks awarded and the assessor signature lines. Marks',
    'are recorded by the assessor and are not amended in place; a correction is',
    'issued as a superseding revision with a stated reason.',
    '',
    'This message was sent automatically by Tathmini. Please do not reply to it.',
    '',
    'Yours faithfully,',
    `Tathmini — ${COLLEGE}`,
  ].join('\n');

  return { subject, text };
}

/**
 * The note that goes to the trainee, in Swahili. The Cc'd assessor and the
 * Bcc'd Coordinator read this same body, by definition of a copy.
 *
 * Copy only - this function decides nothing about who receives it. Addressing,
 * and the rule that IPT trainees are never e-mailed, live in
 * `resolveResultRecipients()`, which is the single authority on both. Putting
 * a second track check here would mean two places to keep in step and one of
 * them eventually wrong.
 */
export function renderTraineeResultEmail(
  data: ReportData,
  context: ResultEmailContext,
): Omit<EmailMessage, 'to' | 'cc' | 'bcc'> {
  const { trainee } = data;

  const firstName = trainee.name.split(' ')[0];
  const subject = `Matokeo ya ${trackLabelSwahili(trainee.track)} — ${trainee.name}`;

  const text = [
    `Ndugu ${trainee.name},`,
    '',
    'MADA: MATOKEO YA TATHMINI YA MAFUNZO KWA VITENDO',
    '',
    `Habari ${firstName}. Kwa heshima na taadhima, tunakujulisha kwamba tathmini`,
    `yako ya ${trackLabelSwahili(trainee.track)} imekamilika, na taarifa kamili ya`,
    'matokeo imeambatishwa kwenye barua pepe hii katika mfumo wa PDF.',
    '',
    'TAARIFA ZAKO:',
    `  Jina: ${trainee.name}`,
    `  Namba ya usajili: ${trainee.registrationNumber ?? '—'}`,
    `  Fani: ${trainee.occupation}`,
    `  Programu: ${trainee.course}`,
    `  Kituo: ${trainee.institution}`,
    '',
    `  Namba ya taarifa: ${context.reportRef}`,
    '',
    'Tafadhali fungua kiambatisho ili kuona alama zako kwa kila kigezo pamoja na',
    'maoni ya msimamizi. Tathmini hufanywa na wasimamizi wawili kwa kujitegemea,',
    'na alama ya mwisho ni wastani wa wote wawili.',
    '',
    'Ukiwa na swali lolote kuhusu matokeo haya, tafadhali wasiliana na ofisi ya',
    'Mratibu wa Mafunzo kwa Vitendo chuoni.',
    '',
    'Barua pepe hii imetumwa na mfumo wa Tathmini. Tafadhali usiijibu.',
    '',
    'Wako katika kuwatumikia,',
    COLLEGE,
  ].join('\n');

  return { subject, text };
}
