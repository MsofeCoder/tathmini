/**
 * What a route's results workbook contains, as data rather than as drawing
 * instructions.
 *
 * TP and IPT print the same sheet with one real difference, and it is not
 * cosmetic. TP is marked out of 100, so a trainee's total and their
 * percentage are the same number and a column for each is pure repetition —
 * the College struck the second one. IPT is marked out of 70, where 57.5 is
 * 82.1%, so collapsing them would print a falsehood on a VETA document. Hence
 * one `TOTAL/100 %` column for TP and two columns, `TOTAL /70` and `%`, for
 * IPT.
 *
 * The difference lives in COLUMNS below and nowhere else: one renderer walks
 * whichever list the track names, so the two layouts cannot drift apart in
 * the way two lookalike renderers eventually do. A third instrument is a new
 * list, not a new renderer.
 *
 * Nothing here computes a mark. Totals, percentages, grades and the Competent
 * verdict are read from `results` exactly as Postgres stored them (AGENTS.md
 * rule 3). The two exceptions are arithmetic the VETA form already prints on
 * each assessor's own page: a TP assessor's theory + practical, and an IPT
 * assessor's own percentage of 70. Both are that assessor's page total, not a
 * result.
 *
 * Pure on purpose — no ExcelJS, no Supabase, no dates. The thing that breaks
 * in a spreadsheet is which column holds which value, and that is testable
 * here without opening a workbook.
 */

export type Track = 'TP' | 'IPT';

/** One assessor's submitted marks for one trainee. */
export interface AssessorMarks {
  /** TP only; null for IPT, which has a single instrument. */
  theory: number | null;
  /** TP only. */
  practical: number | null;
  /** IPT's single mark. For TP this stays null — use theory + practical. */
  single: number | null;
  /** The day the assessment was carried out. Null before migration 0034. */
  assessedOn: string | null;
  /** Null when RLS withheld this assessor's name (see routeSheet). */
  name: string | null;
}

export const NO_MARKS: AssessorMarks = {
  theory: null,
  practical: null,
  single: null,
  assessedOn: null,
  name: null,
};

/** A trainee's row: their particulars, both assessors, the official result. */
export interface RouteResultRow {
  name: string;
  registrationNumber: string | null;
  occupation: string;
  institution: string;
  district: string | null;
  region: string | null;
  a1: AssessorMarks;
  a2: AssessorMarks;
  theoryTotal: number | null;
  practicalTotal: number | null;
  total: number | null;
  pct: number | null;
  grade: string | null;
  competent: boolean | null;
}

/**
 * The AVERAGE block: what the sheet prints as the official result.
 *
 * Every figure is the stored one, exactly as Postgres computed it (AGENTS.md
 * rule 3). Nothing is recomputed here, and that is the College's decision of
 * 21 September after two passes over it.
 *
 * `recompute_result()` uses `avg()`, which divides by the number of marks
 * PRESENT — two assessors give a true half-and-half average, one assessor
 * gives that assessor's mark unchanged. Dividing a lone mark by two was tried
 * and rejected: a result is the average of the reports received, not of the
 * reports expected, so a single report of 59 averages to 59.
 *
 * The lone-assessor case is therefore not disguised, it is shown: the sheet
 * prints 59.00 beside an empty ASSESSOR 1 block, and a reader can see at a
 * glance that only one assessor has reported. That readability is the whole
 * reason both assessors' marks were made visible (migration 0035).
 */
export interface OfficialResult {
  theory: number | null;
  practical: number | null;
  total: number | null;
  pct: number | null;
  grade: string | null;
  verdict: string;
}

export function official(row: RouteResultRow): OfficialResult {
  return {
    theory: row.theoryTotal,
    practical: row.practicalTotal,
    total: row.total,
    pct: row.pct,
    grade: row.grade,
    verdict:
      row.competent === null ? 'NOT YET ASSESSED' : row.competent ? 'COMPETENT' : 'NOT COMPETENT',
  };
}

/**
 * An assessor's own TOTAL MARKS, the figure their page of the VETA form
 * carries. TP sums the two instruments; IPT has only one.
 */
export function assessorTotal(marks: AssessorMarks): number | null {
  if (marks.single !== null) return marks.single;
  if (marks.theory === null || marks.practical === null) return null;
  return round2(marks.theory + marks.practical);
}

/** That total as a percentage of the track's maximum. */
export function assessorPct(marks: AssessorMarks, max: number): number | null {
  const total = assessorTotal(marks);
  return total === null ? null : round2((total / max) * 100);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Which banner a column sits under. `id` is the un-banded identity block. */
export type Band = 'id' | 'a1' | 'a2' | 'avg';

export type CellFormat = 'text' | 'mark' | 'percent';

export interface ColumnSpec {
  header: string;
  width: number;
  band: Band;
  format: CellFormat;
  align: 'left' | 'centre';
  /** Bold in the body — the figures a reader scans for. */
  strong?: boolean;
  value: (row: RouteResultRow, index: number) => string | number | null;
}

/** Marks out of, per track. Drives the headers and the assessor percentages. */
export const TRACK_MAX: Record<Track, number> = { TP: 100, IPT: 70 };

const DASH = '—';

function identityColumns(track: Track): ColumnSpec[] {
  const isIPT = track === 'IPT';
  return [
    {
      header: '#',
      width: 4,
      band: 'id',
      format: 'text',
      align: 'centre',
      value: (_row, i) => i + 1,
    },
    {
      header: 'NAME OF TRAINEE',
      width: 30,
      band: 'id',
      format: 'text',
      align: 'left',
      value: (row) => row.name,
    },
    {
      header: 'REGISTRATION NO',
      width: isIPT ? 20 : 22,
      band: 'id',
      format: 'text',
      align: 'left',
      value: (row) => row.registrationNumber ?? DASH,
    },
    {
      // The IPT register calls it a trade, the TP register an occupation.
      // Both print verbatim on the VETA report, so both keep their word.
      header: isIPT ? 'TRADE' : 'OCCUPATION',
      width: isIPT ? 16 : 30,
      band: 'id',
      format: 'text',
      align: 'left',
      value: (row) => row.occupation,
    },
    {
      // IPT trainees are placed with an employer, not a training centre.
      header: isIPT ? 'COMPANY / INSTITUTION' : 'INSTITUTION',
      width: isIPT ? 26 : 34,
      band: 'id',
      format: 'text',
      align: 'left',
      value: (row) => row.institution,
    },
    {
      header: 'DISTRICT',
      width: 16,
      band: 'id',
      format: 'text',
      align: 'centre',
      value: (row) => row.district ?? DASH,
    },
    {
      header: 'REGION',
      width: 14,
      band: 'id',
      format: 'text',
      align: 'centre',
      value: (row) => row.region ?? DASH,
    },
  ];
}

function verdictColumn(): ColumnSpec {
  return {
    header: 'VERDICT',
    width: 17,
    band: 'avg',
    format: 'text',
    align: 'centre',
    strong: true,
    value: (row) => official(row).verdict,
  };
}

function gradeColumn(): ColumnSpec {
  return {
    header: 'GRADE',
    width: 7,
    band: 'avg',
    format: 'text',
    align: 'centre',
    strong: true,
    value: (row) => official(row).grade ?? DASH,
  };
}

function tpColumns(): ColumnSpec[] {
  const assessor = (slot: 'a1' | 'a2'): ColumnSpec[] => [
    {
      header: 'Theory /50',
      width: 9,
      band: slot,
      format: 'mark',
      align: 'centre',
      value: (row) => row[slot].theory,
    },
    {
      header: 'Practical /50',
      width: 10,
      band: slot,
      format: 'mark',
      align: 'centre',
      value: (row) => row[slot].practical,
    },
    {
      // One column, because on a 100-mark scale the total IS the percentage.
      header: 'TOTAL/100 %',
      width: 10,
      band: slot,
      format: 'percent',
      align: 'centre',
      value: (row) => assessorTotal(row[slot]),
    },
    {
      header: 'Date',
      width: 11,
      band: slot,
      format: 'text',
      align: 'centre',
      value: (row) => row[slot].assessedOn ?? DASH,
    },
  ];

  return [
    ...identityColumns('TP'),
    ...assessor('a1'),
    ...assessor('a2'),
    {
      header: 'Theory /50',
      width: 9,
      band: 'avg',
      format: 'mark',
      align: 'centre',
      value: (row) => official(row).theory,
    },
    {
      header: 'Practical /50',
      width: 10,
      band: 'avg',
      format: 'mark',
      align: 'centre',
      value: (row) => official(row).practical,
    },
    {
      header: 'TOTAL/100 %',
      width: 10,
      band: 'avg',
      format: 'percent',
      align: 'centre',
      strong: true,
      value: (row) => official(row).total,
    },
    gradeColumn(),
    verdictColumn(),
  ];
}

function iptColumns(): ColumnSpec[] {
  const assessor = (slot: 'a1' | 'a2'): ColumnSpec[] => [
    {
      header: 'TOTAL /70',
      width: 10,
      band: slot,
      format: 'mark',
      align: 'centre',
      value: (row) => assessorTotal(row[slot]),
    },
    {
      // Kept, unlike TP: 57.5 out of 70 is not 57.5%.
      header: '%',
      width: 8,
      band: slot,
      format: 'percent',
      align: 'centre',
      value: (row) => assessorPct(row[slot], TRACK_MAX.IPT),
    },
    {
      header: 'Date',
      width: 11,
      band: slot,
      format: 'text',
      align: 'centre',
      value: (row) => row[slot].assessedOn ?? DASH,
    },
  ];

  return [
    ...identityColumns('IPT'),
    ...assessor('a1'),
    ...assessor('a2'),
    {
      header: 'TOTAL /70',
      width: 10,
      band: 'avg',
      format: 'mark',
      align: 'centre',
      strong: true,
      value: (row) => official(row).total,
    },
    {
      header: '%',
      width: 8,
      band: 'avg',
      format: 'percent',
      align: 'centre',
      strong: true,
      value: (row) => official(row).pct,
    },
    gradeColumn(),
    verdictColumn(),
  ];
}

export const COLUMNS: Record<Track, ColumnSpec[]> = {
  TP: tpColumns(),
  IPT: iptColumns(),
};

export interface BandSpan {
  band: Exclude<Band, 'id'>;
  label: string;
  /** 1-based, inclusive. */
  from: number;
  to: number;
}

export interface SheetModel {
  /** The Excel sheet name — the route code, which is already unique. */
  name: string;
  title: string;
  subtitle: string;
  /** Says why an assessor's columns can be blank. See routeSheet(). */
  note: string;
  columns: ColumnSpec[];
  bands: BandSpan[];
  /** Cell values, in column order, one array per trainee. */
  rows: (string | number | null)[][];
  /** Indices into `rows` of trainees nobody has finished assessing. */
  pendingRows: Set<number>;
}

export interface RouteSheetInput {
  routeCode: string;
  routeLabel: string | null;
  track: Track;
  rows: RouteResultRow[];
  /**
   * The assessors the route assigns, from `route_assessor_names()`. Needed
   * only when one of them has not marked anybody yet: with no marks of theirs
   * in the export there is no row to carry the name.
   */
  a1Name?: string | null;
  a2Name?: string | null;
}

/**
 * An assessor's banner.
 *
 * Read through the plain table policies this could only ever name the person
 * downloading: `users_select` allows `id = auth.uid()` and nothing else, so a
 * colleague's row is invisible and the banner read a bare "ASSESSOR 2".
 * Migration 0035 supplies both names through SECURITY DEFINER functions, so
 * the name now comes either from the route's own assignment or, failing that,
 * from any mark that assessor submitted.
 *
 * It still degrades rather than inventing: an assessor who is neither
 * assigned on the route row nor present in any mark has no name to print,
 * and the banner says "ASSESSOR 2" as before.
 */
function bandLabel(
  slot: 'a1' | 'a2',
  rows: RouteResultRow[],
  assigned: string | null | undefined,
): string {
  const ordinal = slot === 'a1' ? 'ASSESSOR 1' : 'ASSESSOR 2';
  const named = assigned ?? rows.find((row) => row[slot].name)?.[slot].name;
  return named ? `${ordinal} - ${named}` : ordinal;
}

/** The whole sheet for one route, ready for a renderer to walk. */
export function routeSheet({
  routeCode,
  routeLabel,
  track,
  rows,
  a1Name,
  a2Name,
}: RouteSheetInput): SheetModel {
  const columns = COLUMNS[track];
  const ordered = [...rows].sort((a, b) =>
    a.name.toUpperCase().localeCompare(b.name.toUpperCase()),
  );

  const bands: BandSpan[] = [];
  for (const [band, label] of [
    ['a1', bandLabel('a1', ordered, a1Name)],
    ['a2', bandLabel('a2', ordered, a2Name)],
    ['avg', 'AVERAGE RESULTS'],
  ] as const) {
    const from = columns.findIndex((c) => c.band === band);
    if (from === -1) continue;
    let to = from;
    while (columns[to + 1]?.band === band) to += 1;
    bands.push({ band, label, from: from + 1, to: to + 1 });
  }

  const trackName =
    track === 'TP' ? 'TEACHING PRACTICE (TP)' : 'INDUSTRIAL PRACTICAL TRAINING (IPT)';

  return {
    name: routeCode,
    title: "MOROGORO VOCATIONAL TEACHERS' TRAINING COLLEGE (MVTTC)",
    subtitle: `${trackName} ASSESSMENT RESULTS - ${routeCode}${
      routeLabel ? `  (${routeLabel})` : ''
    }`,
    /*
      Without this line a supervisor reads the blanks as lost marks and
      reports a bug. The marks are not missing; the database is withholding a
      colleague's assessment until they have submitted it too, which is the
      rule the whole project exists to enforce.
    */
    note: "Blank assessor columns mean that assessor has not submitted yet. A trainee's result is the average of both assessors, and is final only once both have submitted.",
    columns,
    bands,
    rows: ordered.map((row, i) => columns.map((column) => column.value(row, i))),
    // Amber marks a trainee nobody has assessed yet. A provisional row is a
    // different state — it has marks — and says so in its VERDICT column.
    pendingRows: new Set(
      ordered.flatMap((row, i) => (official(row).verdict === 'NOT YET ASSESSED' ? [i] : [])),
    ),
  };
}
