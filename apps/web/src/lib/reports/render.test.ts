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
          },
          a2: {
            supervisorName: 'Assessor Two',
            submittedAt: '2026-01-01T00:00:00Z',
            total: 1,
            itemsByCriterionId: marksMap({ c1: { score: 1 } }),
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
    expect(html.match(/page-break-after: always/g)).toHaveLength(2); // 1 instrument x 2 slots
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

  it('omits a page for a slot with no submitted marks', () => {
    const data = tpData();
    data.instruments[0]!.bySlot.a2 = null;
    const html = renderReportHtml(data, 'TM-TEST');
    expect(html).not.toContain('Assessor Two');
    expect(html.match(/page-break-after: always/g)).toHaveLength(1);
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
    expect(html.match(/page-break-after: always/g)).toHaveLength(1);
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
