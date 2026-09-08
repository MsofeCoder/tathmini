import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EXPORT_TABLES } from './data-export';

/**
 * The export list, checked against the database schema itself.
 *
 * This reads `packages/db/src/schema.ts` off disk, which is not how tests in
 * this app usually work — `apps/web` does not depend on `@tathmini/db`, and
 * adding that dependency to type-check a backup list would drag Drizzle into
 * the web package for one assertion.
 *
 * It earns the oddity because of what it catches. A wrong column name here
 * does not fail loudly: the export simply cannot order that table, drops it
 * into `MISSING-TABLES.txt`, and hands over an archive that looks complete.
 * `assessment_mark_items` was written with `mark_id` — the column is
 * `assessment_mark_id` — and the two largest tables in the assessment, every
 * criterion score ever awarded, would have been quietly absent from the
 * College's only backup.
 *
 * The third test is the one that matters over time: when a future migration
 * adds a table, this fails until somebody decides whether it belongs in the
 * backup. That decision should never be made by forgetting.
 */
function schemaSource(): string {
  const here = fileURLToPath(new URL('.', import.meta.url));
  return readFileSync(`${here}../../../../../packages/db/src/schema.ts`, 'utf8');
}

/** Table name → the source of its column definitions. */
function tableBlocks(source: string): Map<string, string> {
  const blocks = new Map<string, string>();
  const pattern = /export const \w+ = pgTable\(\s*'([a-z_]+)'/g;

  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    const start = match.index + match[0].length;
    const next = source.indexOf('export const', start);
    blocks.set(match[1]!, source.slice(start, next === -1 ? undefined : next));
  }
  return blocks;
}

describe('EXPORT_TABLES against packages/db/src/schema.ts', () => {
  const blocks = tableBlocks(schemaSource());

  it('reads the schema at all — a silently empty parse would pass everything below', () => {
    expect(blocks.size).toBeGreaterThan(10);
    expect(blocks.has('trainees')).toBe(true);
  });

  it('names only tables that exist', () => {
    const unknown = EXPORT_TABLES.filter((t) => !blocks.has(t.table)).map((t) => t.table);
    expect(unknown).toEqual([]);
  });

  it('sorts each table by a column that table actually has', () => {
    const wrong = EXPORT_TABLES.filter(
      (t) => !(blocks.get(t.table) ?? '').includes(`'${t.orderBy}'`),
    ).map((t) => `${t.table}.${t.orderBy}`);
    expect(wrong).toEqual([]);
  });

  /**
   * Add a table to the schema and this fails. That is the point: a backup
   * that omits a table is discovered to have omitted it at the worst possible
   * moment, so the omission has to be deliberate and written down.
   */
  it('exports every table in the schema, leaving nothing out of the backup', () => {
    const exported = new Set(EXPORT_TABLES.map((t) => t.table));
    const missing = [...blocks.keys()].filter((name) => !exported.has(name));
    expect(missing).toEqual([]);
  });
});
