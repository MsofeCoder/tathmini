/**
 * A minimal ZIP writer, store-only (no compression).
 *
 * Written rather than installed for two reasons. A report is already a
 * compressed PDF, so deflating it again buys a percent or two for real CPU on
 * every file — "store" is the right method here regardless of what a library
 * would default to. And the archive is assembled one entry at a time and
 * streamed straight to the browser, so the College can back up hundreds of
 * reports without the serverless function ever holding them all in memory.
 *
 * The format is the original PKZIP one, which every unzip implementation on
 * earth reads: for each file a local header then its bytes, then a central
 * directory listing every entry, then an end-of-central-directory record.
 * Sizes and CRCs are known before each header is written (each file is
 * downloaded whole before it is emitted), so no data descriptors are needed —
 * which is what keeps this compatible with Windows Explorer's built-in
 * extractor, the one the College will actually use.
 *
 * Deliberately NOT Zip64: that starts to matter past 65 535 entries or 4 GB.
 * The whole cohort is 546 trainees at two assessors each, so roughly 1 100
 * reports of a few hundred kilobytes. `MAX_ENTRIES` guards the boundary rather
 * than trusting it.
 */

export const MAX_ENTRIES = 65_535;

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL = 0x06054b50;

/** DOS epoch: ZIP timestamps cannot represent anything before 1980. */
const DOS_EPOCH_YEAR = 1980;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    // Both indexes are provably in range — `bytes[i]` inside the loop bound,
    // and the table lookup masked to a byte — but `noUncheckedIndexedAccess`
    // cannot see that, so the assertions say so rather than adding a branch to
    // the innermost loop of the whole archive.
    crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * MS-DOS date and time, as ZIP has stored them since 1989: two-second
 * resolution, and no timezone at all. Written from the East African wall clock
 * the College reads, because a file dated "yesterday" in an archive made this
 * evening is a support call.
 */
export function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(date.getFullYear(), DOS_EPOCH_YEAR);
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - DOS_EPOCH_YEAR) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

interface CentralRecord {
  nameBytes: Uint8Array;
  crc: number;
  size: number;
  offset: number;
  time: number;
  date: number;
}

/**
 * Accumulates the central directory while the caller streams entries out.
 *
 * Usage is strictly: `entry()` per file, in order, writing what it returns to
 * the stream; then `end()`, writing that too. Nothing is buffered but the
 * directory itself — roughly 80 bytes per file.
 */
export class ZipBuilder {
  private records: CentralRecord[] = [];
  private offset = 0;

  get entryCount(): number {
    return this.records.length;
  }

  entry(name: string, bytes: Uint8Array, modified: Date): Uint8Array {
    if (this.records.length >= MAX_ENTRIES) {
      throw new Error(`A ZIP without Zip64 holds at most ${MAX_ENTRIES} files.`);
    }

    const nameBytes = new TextEncoder().encode(name);
    const crc = crc32(bytes);
    const { time, date } = dosDateTime(modified);

    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, LOCAL_HEADER, true);
    view.setUint16(4, 20, true); // version needed: 2.0, "store"
    // Bit 11 marks the filename as UTF-8, which is what TextEncoder produced.
    view.setUint16(6, 0x0800, true);
    view.setUint16(8, 0, true); // method 0 = stored
    view.setUint16(10, time, true);
    view.setUint16(12, date, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, bytes.length, true); // compressed size == size, stored
    view.setUint32(22, bytes.length, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true); // no extra field
    header.set(nameBytes, 30);

    this.records.push({ nameBytes, crc, size: bytes.length, offset: this.offset, time, date });
    this.offset += header.length + bytes.length;

    const chunk = new Uint8Array(header.length + bytes.length);
    chunk.set(header, 0);
    chunk.set(bytes, header.length);
    return chunk;
  }

  end(): Uint8Array {
    const directorySize = this.records.reduce((total, r) => total + 46 + r.nameBytes.length, 0);
    const out = new Uint8Array(directorySize + 22);
    const view = new DataView(out.buffer);
    let at = 0;

    for (const record of this.records) {
      view.setUint32(at, CENTRAL_HEADER, true);
      view.setUint16(at + 4, 20, true); // version made by
      view.setUint16(at + 6, 20, true); // version needed
      view.setUint16(at + 8, 0x0800, true); // UTF-8 names
      view.setUint16(at + 10, 0, true); // stored
      view.setUint16(at + 12, record.time, true);
      view.setUint16(at + 14, record.date, true);
      view.setUint32(at + 16, record.crc, true);
      view.setUint32(at + 20, record.size, true);
      view.setUint32(at + 24, record.size, true);
      view.setUint16(at + 28, record.nameBytes.length, true);
      view.setUint16(at + 30, 0, true); // extra
      view.setUint16(at + 32, 0, true); // comment
      view.setUint16(at + 34, 0, true); // disk number
      view.setUint16(at + 36, 0, true); // internal attributes
      view.setUint32(at + 38, 0, true); // external attributes
      view.setUint32(at + 42, record.offset, true);
      out.set(record.nameBytes, at + 46);
      at += 46 + record.nameBytes.length;
    }

    view.setUint32(at, END_OF_CENTRAL, true);
    view.setUint16(at + 4, 0, true); // this disk
    view.setUint16(at + 6, 0, true); // disk with the directory
    view.setUint16(at + 8, this.records.length, true);
    view.setUint16(at + 10, this.records.length, true);
    view.setUint32(at + 12, directorySize, true);
    view.setUint32(at + 16, this.offset, true);
    view.setUint16(at + 20, 0, true); // no archive comment

    return out;
  }
}

/**
 * A field for a CSV that Excel will open without an import dialogue: quote
 * everything, double an embedded quote. Quoting unconditionally also protects
 * the register's own data — a trainee name really can contain a comma, and a
 * leading `=` in any cell is a spreadsheet formula waiting to run.
 */
export function csvField(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function csvRow(values: (string | number | null | undefined)[]): string {
  return values.map(csvField).join(',') + '\r\n';
}
