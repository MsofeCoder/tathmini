import { evaluate } from '@tathmini/shared';
import type { CriterionRow } from '@/lib/marking';
import type { AssessorMarks, InstrumentReport, ReportData } from './data';

/**
 * Renders the VETA result report as a full HTML string for Playwright to
 * print to PDF — layout and copy ported field-for-field from
 * reference/Tathmini Result Report.dc.html (CONTEXT.md non-negotiable #6:
 * "same sections, same maxima, same COMPETENT / NOT COMPETENT tick boxes,
 * same signature lines"). One page per (instrument, assessor slot), then a
 * consolidated page carrying the official Postgres-computed average.
 *
 * Built from plain string templates, not JSX: this module is reachable
 * from a 'use server' action, and Next.js's build refuses any module in a
 * server action's graph that imports react-dom/server.
 *
 * The reference file's TRAINEE object invented fields the real schema
 * doesn't have (group, class, lesson time, programme, NTA level) —
 * lib/trainees.ts already made the call to leave those out rather than
 * fake them (see its own comment); the particulars block here uses exactly
 * that same real field set, not the reference's demo data shape.
 */

const BORDER = '1px solid #000';
const PAGE_STYLE =
  'padding: 6mm 8mm; box-sizing: border-box; font-family: "Times New Roman", Times, serif; ' +
  'color: #000; display: flex; flex-direction: column; gap: 3px; page-break-after: always; ' +
  'width: 210mm; min-height: 297mm;';

function esc(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function pct1(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : `${fmt(n)}%`;
}

const TP_INSTRUCTIONS =
  'Fill in two copies; one copy will be given to the candidate. The marks for each observable ' +
  'behaviour are indicated. For each part award a mark which a candidate deserves in accordance ' +
  'with his/her performance. Find the sum of the awarded marks. With the aid of the key below give ' +
  'the trainee’s grade. Comment on the right hand column only when a candidate scores less than ' +
  'half or full score, and not clues such as excellent, very good, good, fair etc. After every ' +
  'assessment the trainee should be consulted and advised on all matters arising during the ' +
  'assessment.';

// Verbatim from reference/forms/IPT assessment form.txt's "Instructions to
// the MVTTC Supervisor", except the tick-box sentence — this digital form
// records the mark directly rather than a five-column paper tick grid.
const IPT_INSTRUCTIONS =
  'This form assesses INDUSTRIAL PRACTICES only. It is completed at the industry during the ' +
  'supervision visit, from direct observation of the trainee at work, inspection of the work ' +
  'produced, questioning at the workstation, examination of the industrial records kept, and ' +
  'consultation with the Industrial Supervisor. Require the trainee to carry out at least one ' +
  'occupation-specific industrial operation in your presence. An assessment made without observing ' +
  'work being performed is not valid. Record the mark awarded for each item, out of the maximum ' +
  'shown. Comment when a candidate scores 3 or below on any item. After the assessment, the trainee ' +
  'should be consulted and advised on all matters arising during the assessment.';

function traineeHeaderLines(trainee: ReportData['trainee']): [string, string][][] {
  const regionDistrict =
    trainee.region && trainee.district
      ? `${trainee.region} · ${trainee.district}`
      : (trainee.region ?? trainee.district ?? '—');
  return [
    [
      ['NAME OF CANDIDATE', trainee.name],
      ['REGISTRATION NO', trainee.registrationNumber ?? '—'],
    ],
    [
      [trainee.track === 'IPT' ? 'INDUSTRY / FIRM' : 'VTC', trainee.institution],
      ['REGION / DISTRICT', regionDistrict],
    ],
    [
      ['OCCUPATION', trainee.occupation],
      ['COURSE', trainee.modeOfStudy ? `${trainee.course} · ${trainee.modeOfStudy}` : trainee.course],
      trainee.track === 'IPT' ? ['PHONE', trainee.phone ?? '—'] : ['EMAIL', trainee.email ?? '—'],
    ],
  ];
}

function keyBox(): string {
  const rows = [
    ['Grade', 'A', 'B', 'C', 'D', 'F'],
    ['Score Range', '80–100%', '65–79%', '50–64%', '40–49%', '00–39%'],
    ['', 'Excellent', 'Very Good', 'Good', 'Poor', 'Fail'],
    ['Class of award', 'First Class', 'Second Class', 'Pass', '', ''],
  ];
  const cells = rows
    .map((row, r) =>
      row
        .map(
          (text, c) =>
            `<div style="padding: 0.5px 3px; border-top: ${r ? BORDER : 'none'}; border-right: ${
              c === 5 ? 'none' : BORDER
            }; font-weight: ${c === 0 || r === 0 ? 700 : 400};">${esc(text)}</div>`,
        )
        .join(''),
    )
    .join('');
  return (
    '<div style="flex: 1.35; border: ' +
    BORDER +
    ';">' +
    '<div style="font-size: 7pt; font-weight: 700; padding: 1px 4px; border-bottom: ' +
    BORDER +
    ';">KEY:</div>' +
    '<div style="display: grid; grid-template-columns: 1.15fr repeat(5, 1fr); font-size: 6pt; text-align: center;">' +
    cells +
    '</div>' +
    '<div style="font-size: 6pt; padding: 1px 4px; border-top: ' +
    BORDER +
    ';">Note: Candidates with grade A, B and C will qualify for NTA Level 5.</div>' +
    '</div>'
  );
}

function cell(text: string, align: 'left' | 'center' | 'right' = 'left', weight = 400): string {
  return (
    `<div style="padding: 0.2px 3px; border-right: ${BORDER}; border-top: ${BORDER}; ` +
    `font-size: 5.9pt; line-height: 1.08; text-align: ${align}; font-weight: ${weight};">${esc(
      text,
    )}</div>`
  );
}

const INSTRUMENT_TITLES: Record<string, { formTitle: string; subtitle: string }> = {
  tp_theory: {
    formTitle: 'TEACHING PRACTICE ASSESSMENT FORM',
    subtitle: 'Classroom situation (Theory / Cognitive)',
  },
  tp_practical: {
    formTitle: 'TEACHING PRACTICE ASSESSMENT FORM',
    subtitle: 'Part B: Workshop situation (Practical / Psychomotor)',
  },
  ipt: {
    formTitle: 'INDUSTRIAL PRACTICAL TRAINING ASSESSMENT FORM',
    subtitle: 'Assessment of industrial practices at the trainee’s place of attachment',
  },
};

const SLOT_LABELS: Record<'a1' | 'a2', string> = { a1: 'Assessor 1', a2: 'Assessor 2' };

function assessorPage(
  trainee: ReportData['trainee'],
  instrument: InstrumentReport,
  slot: 'a1' | 'a2',
  marks: AssessorMarks,
  generatedAt: string,
): string {
  const meta = INSTRUMENT_TITLES[instrument.code] ?? { formTitle: instrument.label, subtitle: '' };
  const slotLabel = SLOT_LABELS[slot];
  const grid = '6% 44% 10% 12% 12% 16%';
  const columns = ['S/N', 'ITEM DESCRIPTION', 'MAX', 'AWARDED', 'AWARDED %', 'COMMENTS'];

  const sections = new Map<string, CriterionRow[]>();
  for (const c of instrument.criteria) {
    const list = sections.get(c.sectionCode) ?? [];
    list.push(c);
    sections.set(c.sectionCode, list);
  }

  const total = marks.total ?? 0;
  const evalResult = evaluate(total, instrument.maxTotal);
  const comments = [...marks.itemsByCriterionId.values()]
    .map((i) => i.comment)
    .filter((c): c is string => !!c && c.trim().length > 0)
    .join(' ');

  const headerLinesHtml = traineeHeaderLines(trainee)
    .map(
      (line) =>
        '<div style="display: flex; gap: 14px; flex-wrap: wrap;">' +
        line
          .map(
            ([label, value]) =>
              `<span>${esc(label)} <span style="font-weight: 700; border-bottom: 1px dotted #000; padding: 0 4px;">${esc(
                value,
              )}</span></span>`,
          )
          .join('') +
        '</div>',
    )
    .join('');

  const columnsHtml = columns
    .map(
      (c, n) =>
        `<div style="padding: 2px 4px; border-right: ${n === columns.length - 1 ? 'none' : BORDER};">${esc(
          c,
        )}</div>`,
    )
    .join('');

  const sectionsHtml = [...sections.entries()]
    .map(([code, items]) => {
      const sectionMax = items[0]?.sectionMax ?? 0;
      const sectionLabel = items[0]?.sectionLabel ?? '';
      const headerRow =
        `<div style="display: grid; grid-template-columns: ${grid}; background: #f0f0f0;">` +
        cell(code, 'center', 700) +
        cell(sectionLabel, 'left', 700) +
        cell(fmt(sectionMax), 'center', 700) +
        cell('', 'center') +
        cell('', 'center') +
        cell('', 'left') +
        '</div>';
      const itemRows = items
        .map((item) => {
          const mark = marks.itemsByCriterionId.get(item.id);
          const score = mark?.score;
          const awardedPct = score === undefined ? '—' : `${Math.round((score / item.itemMax) * 100)}%`;
          return (
            `<div style="display: grid; grid-template-columns: ${grid};">` +
            cell('', 'center') +
            cell(`${item.itemCode} ${item.itemLabel}`, 'left') +
            cell(fmt(item.itemMax), 'center') +
            cell(fmt(score), 'center', 700) +
            cell(awardedPct, 'center') +
            cell(mark?.comment ?? '', 'left') +
            '</div>'
          );
        })
        .join('');
      return headerRow + itemRows;
    })
    .join('');

  const totalRow =
    `<div style="display: grid; grid-template-columns: ${grid}; background: #e2e2e2;">` +
    cell('', 'center', 700) +
    cell('TOTAL', 'right', 700) +
    cell(fmt(instrument.maxTotal), 'center', 700) +
    cell(fmt(total), 'center', 700) +
    cell(pct1(evalResult.pct), 'center', 700) +
    cell('', 'left') +
    '</div>';

  return `
<section style="${PAGE_STYLE}">
  <div style="text-align: center; line-height: 1.25;">
    <div style="font-size: 10pt; font-weight: 700;">VOCATIONAL EDUCATION AND TRAINING AUTHORITY</div>
    <div style="font-size: 9pt; font-weight: 700;">MOROGORO VOCATIONAL TEACHERS&rsquo; TRAINING COLLEGE (MVTTC)</div>
    <div style="font-size: 9.5pt; font-weight: 700; margin-top: 2px; text-decoration: underline;">${esc(meta.formTitle)}</div>
    <div style="font-size: 8.5pt;">${esc(meta.subtitle)}</div>
  </div>

  <div style="font-size: 8pt; line-height: 1.5;">${headerLinesHtml}</div>

  <div style="font-size: 6.4pt; line-height: 1.25; border: ${BORDER}; padding: 2px 5px;">
    <span style="font-weight: 700;">INSTRUCTIONS TO SUPERVISOR(S): </span>${esc(
      instrument.code === 'ipt' ? IPT_INSTRUCTIONS : TP_INSTRUCTIONS,
    )}
  </div>

  <div style="border: ${BORDER};">
    <div style="display: grid; grid-template-columns: ${grid}; font-size: 6.2pt; font-weight: 700; text-align: center; background: #e9e9e9;">${columnsHtml}</div>
    ${sectionsHtml}
    ${totalRow}
  </div>

  <div style="font-size: 7.5pt;">
    <div style="font-weight: 700;">SUPERVISOR&rsquo;S GENERAL COMMENTS:</div>
    <div style="border: ${BORDER}; min-height: 34px; padding: 3px 5px; font-size: 7.2pt; line-height: 1.3; white-space: pre-wrap;">${esc(comments)}</div>
  </div>

  <div style="display: flex; gap: 8px; align-items: flex-start;">
    ${keyBox()}
    <div style="flex: 1; display: flex; flex-direction: column; gap: 6px;">
      <div style="border: ${BORDER};">
        <div style="display: grid; grid-template-columns: 1fr 1fr; font-size: 7.5pt; text-align: center;">
          <div style="padding: 3px 4px; border-right: ${BORDER}; border-bottom: ${BORDER}; font-weight: 700;">TOTAL MARKS</div>
          <div style="padding: 3px 4px; border-bottom: ${BORDER}; font-weight: 700;">GRADE</div>
          <div style="padding: 5px 4px; border-right: ${BORDER}; font-size: 11pt; font-weight: 700;">${esc(fmt(total))} / ${esc(fmt(instrument.maxTotal))}</div>
          <div style="padding: 5px 4px; font-size: 11pt; font-weight: 700;">${esc(evalResult.grade)}</div>
        </div>
      </div>
      <div style="border: ${BORDER};">
        <div style="font-size: 7pt; padding: 2px 5px; border-bottom: ${BORDER};">Please put a tick "&#10003;" in the appropriate box below:</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; font-size: 7.5pt; text-align: center;">
          <div style="padding: 3px 4px; border-right: ${BORDER}; border-bottom: ${BORDER}; font-weight: 700;">COMPETENT</div>
          <div style="padding: 3px 4px; border-bottom: ${BORDER}; font-weight: 700;">NOT COMPETENT</div>
          <div style="padding: 6px 4px; border-right: ${BORDER}; font-size: 13pt; font-weight: 700; line-height: 1;">${evalResult.competent ? '&#10003;' : ''}</div>
          <div style="padding: 6px 4px; font-size: 13pt; font-weight: 700; line-height: 1;">${evalResult.competent ? '' : '&#10003;'}</div>
        </div>
        <div style="font-size: 6.5pt; padding: 2px 5px; border-top: ${BORDER}; line-height: 1.3;">NB: The trainee is recorded as COMPETENT if the total marks assessed reach 50% and above.</div>
      </div>
    </div>
  </div>

  <div style="margin-top: auto; font-size: 7.5pt; display: flex; gap: 14px; align-items: flex-end; padding-top: 3px;">
    <span style="flex: 1.2;">SUPERVISOR&rsquo;S NAME <span style="font-weight: 700; border-bottom: 1px dotted #000; padding: 0 6px;">${esc(marks.supervisorName)} (${esc(slotLabel)})</span></span>
    <span style="flex: 1;">SIGNATURE <span style="border-bottom: 1px dotted #000; padding: 0 26px;">&nbsp;</span></span>
    <span style="flex: 0.9;">DATE <span style="font-weight: 700; border-bottom: 1px dotted #000; padding: 0 6px;">${esc(
      marks.submittedAt ? new Date(marks.submittedAt).toLocaleDateString('en-GB') : '—',
    )}</span></span>
  </div>
  <div style="font-size: 6.5pt; color: #444; text-align: right;">${esc(slotLabel)} · assessors mark independently; the official result is the average of both. Generated ${esc(generatedAt)}.</div>
</section>`;
}

function sCell(text: string, align: 'left' | 'center' | 'right' = 'left', weight = 400, last = false): string {
  return (
    `<div style="padding: 3px 5px; border-top: ${BORDER}; border-right: ${last ? 'none' : BORDER}; ` +
    `font-size: 8.5pt; text-align: ${align}; font-weight: ${weight};">${esc(text)}</div>`
  );
}

function consolidatedPage(data: ReportData, reportRef: string, generatedAt: string): string {
  const { trainee, result, instruments } = data;
  const isIPT = trainee.track === 'IPT';
  const title = isIPT
    ? 'CONSOLIDATED RESULT — INDUSTRIAL PRACTICAL TRAINING'
    : 'CONSOLIDATED RESULT — TEACHING PRACTICE ASSESSMENT';

  const slotTotal = (slot: 'a1' | 'a2') =>
    instruments.reduce((sum, i) => sum + (i.bySlot[slot]?.total ?? 0), 0);
  const slotName = (slot: 'a1' | 'a2') =>
    instruments.find((i) => i.bySlot[slot])?.bySlot[slot]?.supervisorName ?? '—';

  const summaryColumns = isIPT
    ? ['ASSESSOR', 'NAME', `TOTAL / ${fmt(result.max)}`, '%']
    : ['ASSESSOR', 'NAME', 'THEORY / 50', 'PRACTICAL / 50', 'TOTAL / 100', '%'];
  const summaryGrid = isIPT ? '1.3fr 2fr 1fr 0.8fr' : '1.1fr 1.5fr 1fr 1fr 1fr 0.8fr';

  const summaryRow = (label: string, name: string, cells: string[], bg?: string): string =>
    `<div style="display: grid; grid-template-columns: ${summaryGrid};${bg ? ` background: ${bg};` : ''}">` +
    sCell(label, 'left', 700) +
    sCell(name) +
    cells.map((c, i) => sCell(c, 'center', i === cells.length - 1 ? 700 : 400, i === cells.length - 1)).join('') +
    '</div>';

  const a1Total = slotTotal('a1');
  const a2Total = slotTotal('a2');
  const officialTotal = result.total ?? 0;

  const rows = isIPT
    ? [
        summaryRow('Assessor 1', slotName('a1'), [fmt(a1Total), pct1((a1Total / result.max) * 100)]),
        summaryRow('Assessor 2', slotName('a2'), [fmt(a2Total), pct1((a2Total / result.max) * 100)]),
        summaryRow(
          'OFFICIAL AVERAGE',
          'Mean of the two assessors',
          [fmt(officialTotal), pct1(result.pct)],
          '#e2e2e2',
        ),
      ]
    : [
        summaryRow('Assessor 1', slotName('a1'), [
          fmt(instruments.find((i) => i.code === 'tp_theory')?.bySlot.a1?.total),
          fmt(instruments.find((i) => i.code === 'tp_practical')?.bySlot.a1?.total),
          fmt(a1Total),
          pct1((a1Total / result.max) * 100),
        ]),
        summaryRow('Assessor 2', slotName('a2'), [
          fmt(instruments.find((i) => i.code === 'tp_theory')?.bySlot.a2?.total),
          fmt(instruments.find((i) => i.code === 'tp_practical')?.bySlot.a2?.total),
          fmt(a2Total),
          pct1((a2Total / result.max) * 100),
        ]),
        summaryRow(
          'OFFICIAL AVERAGE',
          'Mean of the two assessors',
          [fmt(result.theoryTotal), fmt(result.practicalTotal), fmt(officialTotal), pct1(result.pct)],
          '#e2e2e2',
        ),
      ];

  const allComments = (['a1', 'a2'] as const).map((slot) => {
    const text = instruments
      .flatMap((i) => (i.bySlot[slot] ? [...i.bySlot[slot]!.itemsByCriterionId.values()] : []))
      .map((m) => m.comment)
      .filter((c): c is string => !!c && c.trim().length > 0)
      .join(' ');
    return { tag: slot === 'a1' ? 'ASSESSOR 1 —' : 'ASSESSOR 2 —', text: text || 'No comments recorded.' };
  });

  const signatures = isIPT
    ? [
        { name: slotName('a1'), role: 'Assessor 1 · signature & date' },
        { name: slotName('a2'), role: 'Assessor 2 · signature & date' },
        { name: trainee.name, role: 'Trainee · consulted and advised' },
        { name: 'Industrial Supervisor', role: trainee.institution },
      ]
    : [
        { name: slotName('a1'), role: 'Assessor 1 · signature & date' },
        { name: slotName('a2'), role: 'Assessor 2 · signature & date' },
        { name: trainee.name, role: 'Trainee · consulted and advised' },
        { name: 'TP Coordinator', role: 'MVTTC' },
      ];

  const particulars: [string, string][] = [
    ['Name of candidate', trainee.name],
    ['Registration No', trainee.registrationNumber ?? '—'],
    ['Occupation', trainee.occupation],
    [isIPT ? 'Industry / Firm' : 'VTC', trainee.institution],
    [
      'Region / District',
      trainee.region && trainee.district
        ? `${trainee.region} · ${trainee.district}`
        : (trainee.region ?? trainee.district ?? '—'),
    ],
    ['Date result locked', new Date(result.lockedAt).toLocaleDateString('en-GB')],
  ];

  const particularsHtml = particulars
    .map(
      ([label, value], i) =>
        `<div style="display: flex; justify-content: space-between; gap: 14px; padding: 4px 8px; border-top: ${
          i ? '1px solid #999' : 'none'
        };"><span style="color: #333;">${esc(label)}</span><span style="font-weight: 700;">${esc(value)}</span></div>`,
    )
    .join('');

  const summaryColumnsHtml = summaryColumns
    .map(
      (label, n) =>
        `<div style="padding: 3px 5px; border-right: ${n === summaryColumns.length - 1 ? 'none' : BORDER};">${esc(label)}</div>`,
    )
    .join('');

  const commentsHtml = allComments
    .map(
      (c) =>
        `<div style="padding: 5px 7px; border-bottom: 1px solid #ddd; font-size: 9pt; line-height: 1.45;"><span style="font-weight: 700;">${esc(c.tag)} </span>${esc(c.text)}</div>`,
    )
    .join('');

  const signaturesHtml = signatures
    .map(
      (sg) =>
        `<div><div style="border-bottom: ${BORDER}; height: 26px;"></div><div style="font-weight: 700; margin-top: 3px;">${esc(sg.name)}</div><div style="color: #333;">${esc(sg.role)}</div></div>`,
    )
    .join('');

  return `
<section style="padding: 14mm 12mm; box-sizing: border-box; font-family: 'Times New Roman', Times, serif; color: #000; display: flex; flex-direction: column; gap: 10px; width: 210mm; min-height: 297mm;">
  <div style="text-align: center; line-height: 1.3;">
    <div style="font-size: 12pt; font-weight: 700;">VOCATIONAL EDUCATION AND TRAINING AUTHORITY</div>
    <div style="font-size: 10.5pt; font-weight: 700;">MOROGORO VOCATIONAL TEACHERS&rsquo; TRAINING COLLEGE (MVTTC)</div>
    <div style="font-size: 11.5pt; font-weight: 700; margin-top: 4px; text-decoration: underline;">${esc(title)}</div>
    <div style="font-size: 9pt;">Average of the two independent assessors, as required by the College</div>
  </div>

  <div style="border: ${BORDER}; font-size: 9pt;">${particularsHtml}</div>

  <div style="border: ${BORDER};">
    <div style="display: grid; grid-template-columns: ${summaryGrid}; font-size: 8pt; font-weight: 700; text-align: center; background: #e9e9e9;">${summaryColumnsHtml}</div>
    ${rows.join('')}
  </div>

  <div style="border: 2px solid #000; padding: 8px 12px; display: flex; align-items: center; justify-content: space-between; gap: 18px;">
    <div>
      <div style="font-size: 8.5pt; font-weight: 700;">OFFICIAL VERDICT</div>
      <div style="font-size: 17pt; font-weight: 700; line-height: 1.1;">${result.competent ? 'COMPETENT' : 'NOT COMPETENT'}</div>
      <div style="font-size: 8.5pt;">Average ${esc(fmt(result.total))} of ${esc(fmt(result.max))} (${esc(pct1(result.pct))}) · Grade ${esc(
        result.grade ?? '—',
      )} · GPA ${esc(result.gpa === null ? '—' : fmt(result.gpa))} · Class of Award: ${esc(
        result.classOfAward ?? 'Not awarded',
      )} · threshold 50%</div>
    </div>
    <div style="text-align: right;">
      <div style="font-size: 8pt; font-weight: 700;">AVERAGE</div>
      <div style="font-size: 26pt; font-weight: 700; line-height: 1;">${esc(pct1(result.pct))}</div>
    </div>
  </div>

  <div style="border: ${BORDER};">
    <div style="font-size: 8.5pt; font-weight: 700; padding: 3px 6px; border-bottom: ${BORDER};">COMMENTS TO THE TRAINEE</div>
    ${commentsHtml}
  </div>

  <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-top: auto; font-size: 8.5pt;">${signaturesHtml}</div>
  <div style="font-size: 7pt; color: #444; text-align: center;">Grading key — A 80–100% · B 65–79% · C 50–64% · D 40–49% · F 0–39%. Class of Award and GPA on grades A, B and C only. Recorded as COMPETENT at 50% and above. Generated by Tathmini ${esc(generatedAt)} · report ref ${esc(reportRef)}.</div>
</section>`;
}

export function renderReportHtml(data: ReportData, reportRef: string): string {
  const generatedAt = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

  const assessorPages = data.instruments
    .flatMap((instrument) =>
      (['a1', 'a2'] as const).map((slot) => {
        const marks = instrument.bySlot[slot];
        return marks ? assessorPage(data.trainee, instrument, slot, marks, generatedAt) : '';
      }),
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(data.trainee.name)} — Tathmini Result Report</title>
<style>@page { size: A4; margin: 0; } body { margin: 0; }</style>
</head>
<body>
${assessorPages}
${consolidatedPage(data, reportRef, generatedAt)}
</body>
</html>`;
}
