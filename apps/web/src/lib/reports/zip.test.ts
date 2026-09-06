import { describe, expect, it } from 'vitest';
import { crc32, csvField, csvRow, dosDateTime, ZipBuilder } from './zip';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('crc32', () => {
  // The check value every CRC-32 implementation is measured against.
  it('produces the standard check value for "123456789"', () => {
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926);
  });

  it('is 0 for empty input', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });

  it('matches the known value for "The quick brown fox jumps over the lazy dog"', () => {
    expect(crc32(bytes('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339);
  });

  it('stays inside 32 unsigned bits', () => {
    const value = crc32(bytes('a'.repeat(1000)));
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(0xffffffff);
  });
});

describe('dosDateTime', () => {
  it('packs a date into the MS-DOS fields', () => {
    const { time, date } = dosDateTime(new Date(2026, 8, 6, 19, 30, 20));
    expect(date).toBe(((2026 - 1980) << 9) | (9 << 5) | 6);
    expect(time).toBe((19 << 11) | (30 << 5) | 10); // seconds are two-second steps
  });

  it('clamps anything before the 1980 DOS epoch rather than writing a negative year', () => {
    const { date } = dosDateTime(new Date(1970, 0, 1, 0, 0, 0));
    expect(date).toBe((0 << 9) | (1 << 5) | 1);
  });
});

describe('ZipBuilder', () => {
  it('writes a local header carrying the signature, the size and the CRC', () => {
    const zip = new ZipBuilder();
    const content = bytes('hello');
    const chunk = zip.entry('a.txt', content, new Date(2026, 8, 6, 12, 0, 0));
    const view = new DataView(chunk.buffer, chunk.byteOffset);

    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint16(8, true)).toBe(0); // stored, not deflated
    expect(view.getUint32(14, true)).toBe(crc32(content));
    expect(view.getUint32(18, true)).toBe(content.length);
    expect(view.getUint32(22, true)).toBe(content.length);
    expect(view.getUint16(26, true)).toBe(5); // "a.txt"
    expect(chunk.length).toBe(30 + 5 + content.length);
  });

  it('flags names as UTF-8, so a trainee’s name survives the round trip', () => {
    const zip = new ZipBuilder();
    const chunk = zip.entry('MWANJẸ.pdf', bytes('x'), new Date(2026, 8, 6));
    const view = new DataView(chunk.buffer, chunk.byteOffset);
    expect(view.getUint16(6, true) & 0x0800).toBe(0x0800);
  });

  it('ends with a central directory naming every entry', () => {
    const zip = new ZipBuilder();
    zip.entry('one.txt', bytes('1'), new Date(2026, 8, 6));
    zip.entry('two.txt', bytes('22'), new Date(2026, 8, 6));
    const end = zip.end();
    const view = new DataView(end.buffer, end.byteOffset);

    expect(view.getUint32(0, true)).toBe(0x02014b50); // first central record
    expect(zip.entryCount).toBe(2);

    // The end-of-central-directory record is the last 22 bytes.
    const eocd = new DataView(end.buffer, end.byteOffset + end.length - 22);
    expect(eocd.getUint32(0, true)).toBe(0x06054b50);
    expect(eocd.getUint16(8, true)).toBe(2);
    expect(eocd.getUint16(10, true)).toBe(2);
  });

  it('records each entry’s offset so the directory points at the right file', () => {
    const zip = new ZipBuilder();
    const first = zip.entry('one.txt', bytes('1'), new Date(2026, 8, 6));
    zip.entry('two.txt', bytes('22'), new Date(2026, 8, 6));
    const end = zip.end();
    const view = new DataView(end.buffer, end.byteOffset);

    expect(view.getUint32(42, true)).toBe(0); // first file starts at 0
    const secondRecordAt = 46 + 'one.txt'.length;
    expect(view.getUint32(secondRecordAt + 42, true)).toBe(first.length);
  });

  it('produces a valid, empty archive when there is nothing to back up', () => {
    const zip = new ZipBuilder();
    const end = zip.end();
    expect(end.length).toBe(22);
    const view = new DataView(end.buffer, end.byteOffset);
    expect(view.getUint32(0, true)).toBe(0x06054b50);
    expect(view.getUint16(8, true)).toBe(0);
  });
});

describe('csv', () => {
  it('quotes every field, so a comma in a trainee’s name cannot split a row', () => {
    expect(csvField('MOHELE, RAPHAEL')).toBe('"MOHELE, RAPHAEL"');
  });

  it('doubles an embedded quote', () => {
    expect(csvField('a "quoted" name')).toBe('"a ""quoted"" name"');
  });

  it('renders null and undefined as an empty cell, never as the word null', () => {
    expect(csvField(null)).toBe('""');
    expect(csvField(undefined)).toBe('""');
  });

  it('quotes a leading = so a spreadsheet treats it as text, not a formula', () => {
    expect(csvField('=1+1')).toBe('"=1+1"');
  });

  it('ends rows with CRLF, which is what the CSV format specifies', () => {
    expect(csvRow(['a', 1, null])).toBe('"a","1",""\r\n');
  });
});
