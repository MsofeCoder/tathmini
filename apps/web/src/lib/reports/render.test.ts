import { describe, expect, it } from 'vitest';
import { renderReportHtml } from './render';
import type { CriterionRow } from '@/lib/marking';
import type { ReportData } from './data';

function crit(
  id: string,
  sectionCode: string,
  itemCode: string,
  itemMax: number,
  orderIndex: number,
): CriterionRow {
  return {
    id,
    sectionCode,
    sectionLabel: `Section ${sectionCode}`,
    sectionMax: itemMax,
    itemCode,
    itemLabel: `Item ${itemCode}`,
    itemMax,
    orderIndex,
  };
}

function marksMap(entries: Record<string, { score: number; comment?: string | null }>) {
  const m = new Map<string, { score: number; comment: string | null }>();
  for (const [k, v] of Object.entries(entries))
    m.set(k, { score: v.score, comment: v.comment ?? null });
  return m;
}

const tpCriteria = [crit('c1', '1', 'i.', 1, 1)];

function tpData(overrides: Partial<ReportData> = {}): ReportData {
  return {
    trainee: {
      name: 'Test Trainee',
      registrationNumber: 'REG-1',
      occupation: 'Welding',
      course: 'TC-TVTE',
      modeOfStudy: null,
      institution: 'Test VTC',
      region: 'Morogoro',
      district: 'Morogoro Municipal',
      email: 'test@example.com',
      phone: null,
      track: 'TP',
    },
    result: {
      id: 'result-1',
      theoryTotal: 1,
      practicalTotal: null,
      total: 1,
      max: 1,
      pct: 100,
      grade: 'A',
      gpa: 4,
      classOfAward: 'First Class',
      competent: true,
      lockedAt: '2026-01-01T00:00:00Z',
    },
    instruments: [
      {
        id: 'instr-1',
        code: 'tp_theory',
        label: 'TP Theory',
        maxTotal: 1,
        criteria: tpCriteria,
        bySlot: {
          a1: {
            supervisorName: 'Assessor One',
            submittedAt: '2026-01-01T00:00:00Z',
            total: 1,
            itemsByCriterionId: marksMap({ c1: { score: 1 } }),
            commentsBySectionCode: new Map(),
            generalComment: null,
          },
          a2: {
            supervisorName: 'Assessor Two',
            submittedAt: '2026-01-01T00:00:00Z',
            total: 1,
            itemsByCriterionId: marksMap({ c1: { score: 1 } }),
            commentsBySectionCode: new Map(),
            generalComment: null,
          },
        },
      },
    ],
    ...overrides,
  };
}

describe('renderReportHtml', () => {
  it('escapes trainee-supplied text — never injects raw HTML into the document', () => {
    const data = tpData();
    data.trainee.name = '<img src=x onerror=alert(1)>';
    const html = renderReportHtml(data, 'TM-TEST');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('escapes a supervisor comment the same way', () => {
    const data = tpData();
    data.instruments[0]!.bySlot.a1!.itemsByCriterionId.set('c1', {
      score: 1,
      comment: '<script>alert(1)</script>',
    });
    const html = renderReportHtml(data, 'TM-TEST');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('renders one page per (instrument, slot) plus one consolidated page', () => {
    const html = renderReportHtml(tpData(), 'TM-TEST');
    expect(html.match(/<section data-report-page/g)).toHaveLength(3); // 1 instrument x 2 slots + consolidated
    expect(html).toContain('Assessor One');
    expect(html).toContain('Assessor Two');
    expect(html).toContain('CONSOLIDATED RESULT — TEACHING PRACTICE ASSESSMENT');
    expect(html).toContain('TP Coordinator');
  });

  it('reflects the official verdict/grade from the result row, not a recomputation', () => {
    const data = tpData();
    data.result.competent = false;
    data.result.grade = 'F';
    const html = renderReportHtml(data, 'TM-TEST');
    // The consolidated page's big verdict line — distinct from the fixed
    // "COMPETENT" / "NOT COMPETENT" column headers every assessor page
    // always shows regardless of outcome.
    expect(html).toContain('font-weight: 700; line-height: 1.1;">NOT COMPETENT<');
  });

  it('adapts the consolidated page and signatures for IPT', () => {
    const data = tpData();
    data.trainee.track = 'IPT';
    data.instruments = [
      {
        id: 'instr-ipt',
        code: 'ipt',
        label: 'IPT',
        maxTotal: 1,
        criteria: tpCriteria,
        bySlot: data.instruments[0]!.bySlot,
      },
    ];
    const html = renderReportHtml(data, 'TM-TEST');
    expect(html).toContain('CONSOLIDATED RESULT — INDUSTRIAL PRACTICAL TRAINING');
    expect(html).toContain('Industrial Supervisor');
    expect(html).not.toContain('TP Coordinator');
  });

  it("uses the paper form's six columns, not a collapsed set", () => {
    // reference/forms/TP Theory form.txt. TOTAL POINTS is the section
    // maximum, POINTS DISTRIBUTION the per-item maximum; an earlier version
    // collapsed both into "MAX" and invented an "AWARDED %".
    const html = renderReportHtml(tpData(), 'TM-TEST');
    for (const column of [
      'S/N',
      'ITEM DESCRIPTION',
      'TOTAL POINTS',
      'POINTS DISTRIBUTION',
      'POINTS AWARDED',
      'COMMENTS',
    ]) {
      expect(html).toContain(`>${column}<`);
    }
    expect(html).not.toContain('AWARDED %');
  });

  it('merges S/N and COMMENTS down each section, as the paper form does', () => {
    // One section of one criterion => the section row plus 1 item row, so both
    // merged cells span 2.
    const html = renderReportHtml(tpData(), 'TM-TEST');
    expect((html.match(/rowspan="2"/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("gathers a section's criterion comments into its one merged cell", () => {
    const data = tpData();
    data.instruments[0]!.bySlot.a1!.itemsByCriterionId = new Map([
      ['c1', { score: 1, comment: 'Involve every trainee, not only volunteers.' }],
    ]);
    const html = renderReportHtml(data, 'TM-TEST');
    expect(html).toContain('Involve every trainee, not only volunteers.');
  });

  it('omits a page for a slot with no submitted marks', () => {
    const data = tpData();
    data.instruments[0]!.bySlot.a2 = null;
    const html = renderReportHtml(data, 'TM-TEST');
    expect(html).not.toContain('Assessor Two');
    expect(html.match(/<section data-report-page/g)).toHaveLength(2); // 1 assessor + consolidated
  });

  it('omits the consolidated page entirely until the result is locked', () => {
    // Until both assessors are in, recompute_result() has averaged over one
    // assessor's marks, so result.grade/competent are provisional and will
    // change. Publishing them to a trainee would state a verdict that later
    // moves — so the page is left out rather than shown with a caveat.
    const data = tpData();
    data.result.lockedAt = null;
    data.instruments[0]!.bySlot.a2 = null;
    const html = renderReportHtml(data, 'TM-TEST');

    expect(html).not.toContain('CONSOLIDATED RESULT');
    expect(html).not.toContain('TP Coordinator');
    // The assessor's own sheet is still a complete VETA document.
    expect(html).toContain('Assessor One');
    expect(html.match(/<section data-report-page/g)).toHaveLength(1);
  });

  it('is a one-assessor document when scoped to a single slot, even once locked', () => {
    // Each assessor stores their own report; a trainee receives one per
    // assessor. getReportData({ slot }) drops the other slot, and a locked
    // result must not smuggle the colleague's marks back into this one.
    const data = tpData();
    data.instruments[0]!.bySlot.a2 = null;
    const html = renderReportHtml(data, 'TM-TEST');

    expect(html).toContain('Assessor One');
    expect(html).not.toContain('Assessor Two');
    // Locked, so the official consolidated page is still carried.
    expect(html).toContain('CONSOLIDATED RESULT');
  });
});

/**
 * The comment surfaces moved from sub-criterion to criterion on 2026-09-05.
 * These pin both halves of that: the new source is used when present, and the
 * old one still renders when it is not — a report generated before the change
 * must print exactly as it did then.
 */
describe('renderReportHtml — criterion and general comments', () => {
  it('prints the criterion comment in the merged COMMENTS cell', () => {
    const data = tpData();
    data.instruments[0]!.bySlot.a1!.commentsBySectionCode = new Map([
      ['1', 'Prepare the scheme of work before the lesson.'],
    ]);
    const html = renderReportHtml(data, 'TM-TEST');
    expect(html).toContain('Prepare the scheme of work before the lesson.');
  });

  it('falls back to the old per-item comments when no criterion comment exists', () => {
    const data = tpData();
    data.instruments[0]!.bySlot.a1!.itemsByCriterionId.set('c1', {
      score: 1,
      comment: 'Legacy per-item advice.',
    });
    const html = renderReportHtml(data, 'TM-TEST');
    expect(html).toContain('Legacy per-item advice.');
  });

  it('prefers the criterion comment over the legacy per-item ones', () => {
    const data = tpData();
    data.instruments[0]!.bySlot.a1!.itemsByCriterionId.set('c1', {
      score: 1,
      comment: 'Legacy per-item advice.',
    });
    data.instruments[0]!.bySlot.a1!.commentsBySectionCode = new Map([['1', 'Current advice.']]);
    const html = renderReportHtml(data, 'TM-TEST');
    expect(html).toContain('Current advice.');
    expect(html).not.toContain('Legacy per-item advice.');
  });

  it('prints the general comment under SUPERVISOR’S GENERAL COMMENTS', () => {
    const data = tpData();
    data.instruments[0]!.bySlot.a1!.generalComment = 'Consult the trainee after the visit.';
    const html = renderReportHtml(data, 'TM-TEST');
    expect(html).toContain('Consult the trainee after the visit.');
  });

  it('escapes a criterion comment rather than injecting it', () => {
    const data = tpData();
    data.instruments[0]!.bySlot.a1!.commentsBySectionCode = new Map([
      ['1', '<script>alert(1)</script>'],
    ]);
    const html = renderReportHtml(data, 'TM-TEST');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});
