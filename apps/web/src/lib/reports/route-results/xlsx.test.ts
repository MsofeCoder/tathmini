import { PassThrough } from 'node:stream';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { routeSheet, type RouteResultRow } from './layout';
import { safeSheetName, writeRouteResultsWorkbook } from './xlsx';

/**
 * A round trip through a real workbook.
 *
 * layout.test.ts proves the right value is in the right column; this proves
 * the file those values land in is one Excel will actually open. Every other
 * test here could pass while the download is a corrupt archive, which is the
 * failure a supervisor would meet first and understand least.
 */
async function render(models: Parameters<typeof writeRouteResultsWorkbook>[0]) {
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));

  await writeRouteResultsWorkbook(models, stream);

  const book = new ExcelJS.Workbook();
  await book.xlsx.load(
    Buffer.concat(chunks) as unknown as ArrayBuffer & { buffer: ArrayBufferLike },
  );
  return book;
}

const TP_ROW: RouteResultRow = {
  name: 'ABAS JAMAL MGOVANO',
  registrationNumber: 'MVTTC/CAVT/2025/0357',
  occupation: 'Motor Vehicle Mechanics',
  institution: 'IRINGA RVTSC',
  district: 'IRINGA',
  region: 'IRINGA',
  a1: { theory: 31, practical: 31.5, single: null, assessedOn: null, name: 'Nehemia David' },
  a2: { theory: 34.5, practical: 35.5, single: null, assessedOn: null, name: null },
  theoryTotal: 32.75,
  practicalTotal: 33.5,
  total: 66.3,
  pct: 66.3,
  grade: 'B',
  competent: true,
  lockedAt: '2026-09-16T07:47:19Z',
};

const IPT_ROW: RouteResultRow = {
  name: 'Adeni Mwanitu',
  registrationNumber: null,
  occupation: 'MEC',
  institution: 'Zone AUTO',
  district: 'Dodoma',
  region: 'DODOMA',
  a1: { theory: null, practical: null, single: 58, assessedOn: '2026-09-08', name: 'Aron Franco' },
  a2: { theory: null, practical: null, single: 55, assessedOn: '2026-09-08', name: null },
  theoryTotal: null,
  practicalTotal: null,
  total: 56.5,
  pct: 80.71,
  grade: 'A',
  competent: true,
  lockedAt: '2026-09-16T07:47:19Z',
};

const TP = routeSheet({
  routeCode: 'TP ROUTE 5',
  routeLabel: null,
  track: 'TP',
  rows: [TP_ROW],
});

const IPT = routeSheet({
  routeCode: 'IPT ROUTE 2',
  routeLabel: 'MORO/DODOMA/KILIMANJARO',
  track: 'IPT',
  rows: [IPT_ROW],
});

describe('writeRouteResultsWorkbook', () => {
  it('produces a workbook that reads back, with the route as the sheet name', async () => {
    const book = await render([TP]);

    expect(book.worksheets.map((s) => s.name)).toEqual(['TP ROUTE 5']);
  });

  it('gives a supervisor covering two tracks one sheet each', async () => {
    const book = await render([IPT, TP]);

    expect(book.worksheets.map((s) => s.name)).toEqual(['IPT ROUTE 2', 'TP ROUTE 5']);
  });

  it('writes the headers on row 6 and the first trainee on row 7', async () => {
    const book = await render([TP]);
    const sheet = book.getWorksheet('TP ROUTE 5');

    expect(sheet?.getCell('A6').value).toBe('#');
    expect(sheet?.getCell('B6').value).toBe('NAME OF TRAINEE');
    expect(sheet?.getCell('B7').value).toBe('ABAS JAMAL MGOVANO');
    expect(sheet?.getCell('A7').value).toBe(1);
  });

  it('keeps marks as numbers, not text, so the sheet can be totalled', async () => {
    const book = await render([TP]);
    const sheet = book.getWorksheet('TP ROUTE 5');

    expect(sheet?.getCell('H7').value).toBe(31);
    expect(typeof sheet?.getCell('H7').value).toBe('number');
    // Assessor 1's own TOTAL MARKS: 31 + 31.5.
    expect(sheet?.getCell('J7').value).toBe(62.5);
  });

  it('carries the IPT percentage separately from the mark out of 70', async () => {
    const book = await render([IPT]);
    const sheet = book.getWorksheet('IPT ROUTE 2');

    expect(sheet?.getCell('H6').value).toBe('TOTAL /70');
    expect(sheet?.getCell('I6').value).toBe('%');
    expect(sheet?.getCell('H7').value).toBe(58);
    expect(sheet?.getCell('I7').value).toBe(82.86);
  });

  it('banners each assessor across their own columns', async () => {
    const book = await render([TP]);
    const sheet = book.getWorksheet('TP ROUTE 5');

    expect(sheet?.getCell('H5').value).toBe('ASSESSOR 1 - Nehemia David');
    expect(sheet?.getCell('L5').value).toBe('ASSESSOR 2');
    expect(sheet?.getCell('P5').value).toBe('AVERAGE RESULTS');
  });

  it('explains the blanks where an assessor has not submitted', async () => {
    const book = await render([TP]);

    expect(String(book.getWorksheet('TP ROUTE 5')?.getCell('A3').value)).toMatch(
      /has not submitted yet/i,
    );
  });
});

describe('safeSheetName', () => {
  it('leaves a route code alone', () => {
    expect(safeSheetName('TP ROUTE 5')).toBe('TP ROUTE 5');
  });

  it('strips the characters Excel refuses in a sheet name', () => {
    expect(safeSheetName('TP/ROUTE:5[a]')).toBe('TP ROUTE 5 a');
  });

  it('truncates past the 31-character limit', () => {
    expect(safeSheetName('X'.repeat(40))).toHaveLength(31);
  });

  it('never returns an empty name', () => {
    expect(safeSheetName('///')).toBe('Results');
  });
});
