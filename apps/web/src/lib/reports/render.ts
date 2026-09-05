import { evaluate } from '@tathmini/shared';
import type { CriterionRow } from '@/lib/marking';
import type { AssessorMarks, InstrumentReport, ReportData } from './data';

/**
 * The comment printed in a criterion's merged COMMENTS cell.
 *
 * Since 2026-09-05 a supervisor writes one comment per criterion and it is
 * stored as such. Before that the app forced a comment on each sub-criterion
 * scored below half, and those rows are still in the database — so when a mark
 * carries no section comment, the old per-item comments are joined back
 * together in criterion order. Without that fallback every report generated
 * before the change would come back blank in this column.
 */
function sectionCommentFor(
  marks: AssessorMarks,
  sectionCode: string,
  items: CriterionRow[],
): string {
  const stored = marks.commentsBySectionCode.get(sectionCode);
  if (stored && stored.trim().length > 0) return stored.trim();

  return items
    .map((item) => marks.itemsByCriterionId.get(item.id)?.comment)
    .filter((c): c is string => !!c && c.trim().length > 0)
    .join(' ');
}

/**
 * SUPERVISOR'S GENERAL COMMENTS. Same fallback, same reason: a mark submitted
 * before the change has no general comment of its own, and what filled this
 * block then was every per-item comment joined together.
 */
function generalCommentFor(marks: AssessorMarks): string {
  if (marks.generalComment && marks.generalComment.trim().length > 0) {
    return marks.generalComment.trim();
  }
  // Only a mark with no criterion comments at all can be a pre-2026-09-05 one,
  // and only then do the per-item comments stand in for a general comment.
  // Without this guard a current mark whose supervisor left the general box
  // empty would repeat its criterion comments down here, printing the same
  // advice twice on one page.
  if (marks.commentsBySectionCode.size > 0) return '';

  return [...marks.itemsByCriterionId.values()]
    .map((i) => i.comment)
    .filter((c): c is string => !!c && c.trim().length > 0)
    .join(' ');
}

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
  'color: #000; display: flex; flex-direction: column; gap: 3px; ' +
  'width: 210mm; min-height: 297mm;';

// Every page starts on a fresh sheet. Expressed as break-BEFORE on each page
// that follows another, rather than break-after on every page: break-after on
// the last one emits a trailing blank sheet, which matters more now that the
// consolidated page is dropped for an unlocked result — the report would have
// ended on an empty page. The adjacent-sibling selector applies it to every
// page except the first, so there is nothing to keep in sync by hand.
//
// Both spellings are present deliberately: `break-before` is the current
// property, `page-break-before` the legacy alias, and print engines are not
// uniform about which they honour.
const PAGE_BREAK_CSS =
  'section[data-report-page] + section[data-report-page] ' +
  '{ break-before: page; page-break-before: always; }';

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
      [
        'COURSE',
        trainee.modeOfStudy ? `${trainee.course} · ${trainee.modeOfStudy}` : trainee.course,
      ],
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

interface CellOptions {
  align?: 'left' | 'center' | 'right';
  weight?: number;
  /** Vertical merge, as the paper form does for S/N and COMMENTS. */
  rowSpan?: number;
  valign?: 'top' | 'middle';
  background?: string;
}

/** One `<td>` of the assessment table. */
function td(text: string, options: CellOptions = {}): string {
  const { align = 'left', weight = 400, rowSpan, valign = 'middle', background } = options;
  return (
    `<td${rowSpan && rowSpan > 1 ? ` rowspan="${rowSpan}"` : ''} ` +
    `style="border: ${BORDER}; padding: 0.6px 3px; font-size: 5.9pt; line-height: 1.08; ` +
    `text-align: ${align}; vertical-align: ${valign}; font-weight: ${weight};` +
    `${background ? ` background: ${background};` : ''}">${esc(text)}</td>`
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

function assessorPage(
  trainee: ReportData['trainee'],
  instrument: InstrumentReport,
  slot: 'a1' | 'a2',
  marks: AssessorMarks,
  generatedAt: string,
): string {
  const meta = INSTRUMENT_TITLES[instrument.code] ?? { formTitle: instrument.label, subtitle: '' };
  // Columns verbatim from the paper form (reference/forms/TP Theory form.txt,
  // and the same six on TP Practical and IPT): TOTAL POINTS carries the
  // section maximum, POINTS DISTRIBUTION the per-item maximum. An earlier
  // version collapsed those two into one "MAX" column and added an
  // "AWARDED %" the form does not have — that is a different document, and
  // CONTEXT.md non-negotiable #6 requires this one field for field.
  const columns = [
    'S/N',
    'ITEM DESCRIPTION',
    'TOTAL POINTS',
    'POINTS DISTRIBUTION',
    'POINTS AWARDED',
    'COMMENTS',
  ];
  const columnWidths = ['5%', '41%', '9%', '11%', '11%', '23%'];

  const sections = new Map<string, CriterionRow[]>();
  for (const c of instrument.criteria) {
    const list = sections.get(c.sectionCode) ?? [];
    list.push(c);
    sections.set(c.sectionCode, list);
  }

  const total = marks.total ?? 0;
  const evalResult = evaluate(total, instrument.maxTotal);
  const comments = generalCommentFor(marks);

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

  const colgroup = columnWidths.map((w) => `<col style="width: ${w};" />`).join('');

  const columnsHtml = columns
    .map(
      (c) =>
        `<th style="border: ${BORDER}; padding: 2px 3px; font-size: 6.2pt; line-height: 1.1; ` +
        `text-align: center; vertical-align: middle; background: #e9e9e9;">${esc(c)}</th>`,
    )
    .join('');

  // One <tbody> per section, so a section and its merged S/N and COMMENTS
  // cells are never split across a page boundary — a rowspan broken over two
  // sheets renders as a detached, unreadable fragment.
  const sectionsHtml = [...sections.entries()]
    .map(([code, items]) => {
      const sectionMax = items[0]?.sectionMax ?? 0;
      const sectionLabel = items[0]?.sectionLabel ?? '';
      const span = items.length + 1;

      // The paper form gives each SECTION one merged comment cell, and since
      // 2026-09-05 that is exactly how it is captured too. Assessments
      // submitted before then stored a comment per sub-criterion, so those are
      // gathered back into the cell in criterion order — a report generated
      // last week must still print the same way today.
      const sectionComment = sectionCommentFor(marks, code, items);

      const sectionAwarded = items.reduce(
        (sum, item) => sum + (marks.itemsByCriterionId.get(item.id)?.score ?? 0),
        0,
      );

      // S/N and COMMENTS are opened here and span the section's item rows —
      // exactly the vertical merge the paper form uses.
      const headerRow =
        '<tr>' +
        td(code, { align: 'center', weight: 700, rowSpan: span, valign: 'top' }) +
        td(sectionLabel, { weight: 700, background: '#f0f0f0' }) +
        td(fmt(sectionMax), { align: 'center', weight: 700, background: '#f0f0f0' }) +
        td('', { background: '#f0f0f0' }) +
        td(fmt(sectionAwarded), { align: 'center', weight: 700, background: '#f0f0f0' }) +
        td(sectionComment, { rowSpan: span, valign: 'top' }) +
        '</tr>';

      const itemRows = items
        .map((item) => {
          const score = marks.itemsByCriterionId.get(item.id)?.score;
          return (
            '<tr>' +
            td(`${item.itemCode} ${item.itemLabel}`) +
            td('', { align: 'center' }) +
            td(fmt(item.itemMax), { align: 'center' }) +
            td(fmt(score), { align: 'center', weight: 700 }) +
            '</tr>'
          );
        })
        .join('');

      return `<tbody style="break-inside: avoid; page-break-inside: avoid;">${headerRow}${itemRows}</tbody>`;
    })
    .join('');

  const totalRow =
    '<tbody><tr>' +
    td('', { background: '#e2e2e2' }) +
    td('TOTAL', { align: 'right', weight: 700, background: '#e2e2e2' }) +
    td(fmt(instrument.maxTotal), { align: 'center', weight: 700, background: '#e2e2e2' }) +
    td('', { background: '#e2e2e2' }) +
    td(fmt(total), { align: 'center', weight: 700, background: '#e2e2e2' }) +
    td(pct1(evalResult.pct), { align: 'center', weight: 700, background: '#e2e2e2' }) +
    '</tr></tbody>';

  return `
<section data-report-page style="${PAGE_STYLE}">
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

  <table style="border-collapse: collapse; table-layout: fixed; width: 100%;">
    <colgroup>${colgroup}</colgroup>
    <thead><tr>${columnsHtml}</tr></thead>
    ${sectionsHtml}
    ${totalRow}
  </table>

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
    <span style="flex: 1.2;">SUPERVISOR&rsquo;S NAME <span style="font-weight: 700; border-bottom: 1px dotted #000; padding: 0 6px;">${esc(marks.supervisorName)}</span></span>
    <span style="flex: 1;">SIGNATURE <span style="border-bottom: 1px dotted #000; padding: 0 26px;">&nbsp;</span></span>
    <span style="flex: 0.9;">DATE <span style="font-weight: 700; border-bottom: 1px dotted #000; padding: 0 6px;">${esc(
      marks.submittedAt ? new Date(marks.submittedAt).toLocaleDateString('en-GB') : '—',
    )}</span></span>
  </div>
  <div style="font-size: 6.5pt; color: #444; text-align: right;">Generated ${esc(generatedAt)}.</div>
</section>`;
}

function sCell(
  text: string,
  align: 'left' | 'center' | 'right' = 'left',
  weight = 400,
  last = false,
): string {
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
    cells
      .map((c, i) => sCell(c, 'center', i === cells.length - 1 ? 700 : 400, i === cells.length - 1))
      .join('') +
    '</div>';

  const a1Total = slotTotal('a1');
  const a2Total = slotTotal('a2');
  const officialTotal = result.total ?? 0;

  const rows = isIPT
    ? [
        summaryRow('Assessor 1', slotName('a1'), [
          fmt(a1Total),
          pct1((a1Total / result.max) * 100),
        ]),
        summaryRow('Assessor 2', slotName('a2'), [
          fmt(a2Total),
          pct1((a2Total / result.max) * 100),
        ]),
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
          [
            fmt(result.theoryTotal),
            fmt(result.practicalTotal),
            fmt(officialTotal),
            pct1(result.pct),
          ],
          '#e2e2e2',
        ),
      ];

  const allComments = (['a1', 'a2'] as const).map((slot) => {
    const text = instruments
      .map((i) => (i.bySlot[slot] ? generalCommentFor(i.bySlot[slot]!) : ''))
      .filter((c) => c.trim().length > 0)
      .join(' ');
    return {
      tag: slot === 'a1' ? 'ASSESSOR 1 —' : 'ASSESSOR 2 —',
      text: text || 'No comments recorded.',
    };
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
    [
      'Date result locked',
      // renderReportHtml only reaches this page once the result is locked;
      // the fallback keeps the type honest rather than asserting non-null.
      result.lockedAt ? new Date(result.lockedAt).toLocaleDateString('en-GB') : '—',
    ],
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
<section data-report-page style="padding: 14mm 12mm; box-sizing: border-box; font-family: 'Times New Roman', Times, serif; color: #000; display: flex; flex-direction: column; gap: 10px; width: 210mm; min-height: 297mm;">
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
  const generatedAt = new Date().toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const assessorPages = data.instruments
    .flatMap((instrument) =>
      (['a1', 'a2'] as const).map((slot) => {
        const marks = instrument.bySlot[slot];
        return marks ? assessorPage(data.trainee, instrument, slot, marks, generatedAt) : '';
      }),
    )
    .join('');

  // The consolidated page carries the OFFICIAL result — the average of both
  // assessors, with the grade, GPA, class of award and verdict Postgres
  // computed. Until the result is locked, recompute_result() has averaged
  // over whichever marks exist so far, so those figures are provisional and
  // will change when the second assessor submits. Printing them on a report
  // that goes to a trainee would publish a verdict that later moves, so the
  // page is omitted entirely until locked.
  //
  // Nothing is invented to replace it: each assessor page is already a
  // complete VETA sheet with its own TOTAL MARKS and its own COMPETENT /
  // NOT COMPETENT box, exactly as in reference/Tathmini Result Report.dc.html.
  const consolidated = data.result.lockedAt ? consolidatedPage(data, reportRef, generatedAt) : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(data.trainee.name)} — Tathmini Result Report</title>
<style>@page { size: A4; margin: 0; } body { margin: 0; } ${PAGE_BREAK_CSS}</style>
</head>
<body>
${assessorPages}
${consolidated}
</body>
</html>`;
}
