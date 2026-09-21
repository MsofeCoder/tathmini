/**
 * The workbook itself. The only file here that imports ExcelJS.
 *
 * It walks whatever `routeSheet()` produced and knows nothing about TP, IPT,
 * marks or grading — which column means what was decided in layout.ts. That
 * seam is deliberate: spreadsheet output is awkward to assert against, so the
 * part that actually breaks (which column carries which value) is tested over
 * there, with no workbook to open.
 *
 * Streamed rather than buffered, matching the data export beside it: the
 * route hands the response a stream and ExcelJS commits rows into it.
 */

import type { Writable } from 'node:stream';
import ExcelJS from 'exceljs';
import type { CellFormat, SheetModel } from './layout';

const NAVY = 'FF1F3864';
const BLUE = 'FF2E75B6';
const GREEN = 'FF548235';
const ZEBRA = 'FFF2F2F2';
/** The College's colour for a trainee nobody has finished assessing. */
const AMBER = 'FFFFF2CC';
const RULE = 'FFBFBFBF';

const GREEN_TEXT = 'FF1E6B33';
const RED_TEXT = 'FFC00000';
const AMBER_TEXT = 'FF9C6500';

const NUMBER_FORMATS: Record<CellFormat, string | undefined> = {
  text: undefined,
  mark: '0.00',
  percent: '0.0"%"',
};

const BAND_FILL = { a1: BLUE, a2: GREEN, avg: NAVY } as const;

const border = {
  top: { style: 'thin' as const, color: { argb: RULE } },
  left: { style: 'thin' as const, color: { argb: RULE } },
  bottom: { style: 'thin' as const, color: { argb: RULE } },
  right: { style: 'thin' as const, color: { argb: RULE } },
};

function fill(argb: string) {
  return { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } };
}

/**
 * Excel forbids : \ / ? * [ ] in a sheet name and caps it at 31 characters.
 * Route codes ("TP ROUTE 5") break none of that, but a renamed route should
 * not be able to produce a file Excel refuses to open.
 */
export function safeSheetName(name: string): string {
  return (
    name
      .replace(/[:\\/?*[\]]/g, ' ')
      .slice(0, 31)
      .trim() || 'Results'
  );
}

function writeSheet(book: ExcelJS.stream.xlsx.WorkbookWriter, model: SheetModel): void {
  const sheet = book.addWorksheet(safeSheetName(model.name), {
    views: [{ showGridLines: false, state: 'frozen', xSplit: 2, ySplit: 6 }],
  });

  const width = model.columns.length;
  sheet.columns = model.columns.map((column) => ({ width: column.width }));

  /*
    Order matters, and not obviously: the streaming writer flushes a row the
    moment it is committed, and a flushed row can no longer be merged —
    `mergeCells` throws "Out of bounds: this row has been committed". So every
    merge is declared before the row it spans is committed, never after. The
    non-streaming Workbook is forgiving about this; WorkbookWriter is not.
  */
  const titleRow = sheet.addRow([model.title]);
  titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: NAVY } };
  titleRow.getCell(1).alignment = { horizontal: 'center' };
  sheet.mergeCells(1, 1, 1, width);
  titleRow.commit();

  const subtitleRow = sheet.addRow([model.subtitle]);
  subtitleRow.getCell(1).font = { bold: true, size: 12, color: { argb: NAVY } };
  subtitleRow.getCell(1).alignment = { horizontal: 'center' };
  sheet.mergeCells(2, 1, 2, width);
  subtitleRow.commit();

  const noteRow = sheet.addRow([model.note]);
  noteRow.getCell(1).font = { size: 9, italic: true, color: { argb: 'FF5B6B78' } };
  noteRow.getCell(1).alignment = { horizontal: 'center' };
  sheet.mergeCells(3, 1, 3, width);
  noteRow.commit();

  sheet.addRow([]).commit();

  const bandRow = sheet.addRow([]);
  for (const band of model.bands) {
    const cell = bandRow.getCell(band.from);
    cell.value = band.label;
    cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    cell.fill = fill(BAND_FILL[band.band]);
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }
  for (const band of model.bands) sheet.mergeCells(5, band.from, 5, band.to);
  bandRow.commit();

  const headerRow = sheet.addRow(model.columns.map((column) => column.header));
  headerRow.height = 30;
  headerRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    cell.fill = fill(NAVY);
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = border;
  });
  headerRow.commit();

  const HEADER_ROW = 6;

  model.rows.forEach((values, index) => {
    const row = sheet.addRow(values);
    const pending = model.pendingRows.has(index);
    const shade = pending ? AMBER : index % 2 === 1 ? ZEBRA : null;

    model.columns.forEach((column, i) => {
      const cell = row.getCell(i + 1);
      cell.border = border;
      cell.font = { size: 9, bold: column.strong === true };
      cell.alignment = { horizontal: column.align === 'left' ? 'left' : 'center' };
      const format = NUMBER_FORMATS[column.format];
      if (format) cell.numFmt = format;
      if (shade) cell.fill = fill(shade);

      if (column.header === 'VERDICT') {
        const colour =
          cell.value === 'COMPETENT'
            ? GREEN_TEXT
            : cell.value === 'NOT COMPETENT'
              ? RED_TEXT
              : AMBER_TEXT;
        cell.font = { size: 9, bold: true, color: { argb: colour } };
      }
    });

    row.commit();
  });

  sheet.autoFilter = {
    from: { row: HEADER_ROW, column: 1 },
    to: { row: HEADER_ROW + model.rows.length, column: width },
  };

  sheet.commit();
}

/**
 * One workbook, one sheet per route.
 *
 * A supervisor covering a TP route and an IPT route gets both, each in its
 * own layout — which is why this takes a list rather than a single sheet.
 * The common case, one route, is that list with one entry and needs no
 * special handling.
 */
export function writeRouteResultsWorkbook(models: SheetModel[], stream: Writable): Promise<void> {
  const book = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream,
    useStyles: true,
    useSharedStrings: false,
  });
  book.creator = 'Tathmini';
  book.created = new Date();

  for (const model of models) writeSheet(book, model);

  return book.commit();
}
