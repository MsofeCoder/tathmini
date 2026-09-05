import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guards the migrations directory itself.
 *
 * On 2026-09-05 two agents working the same repository produced THREE
 * migration-number collisions in one afternoon — 0016, two 0017s and two
 * 0018s — because a number was claimed the moment a file was written rather
 * than when its branch merged. Each one was found by a human reading a
 * directory listing, hours later, after the second file had already been
 * applied to production. Renumbering an applied migration is worse than the
 * collision, so the cost of finding this late is real.
 *
 * These assertions cost nothing and catch it on the first push instead.
 * A migration number is not yours until your branch is on main; this is what
 * says so out loud.
 */

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

interface JournalEntry {
  idx: number;
  tag: string;
}

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

function journalTags(): string[] {
  const raw = readFileSync(join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8');
  return (JSON.parse(raw) as { entries: JournalEntry[] }).entries.map((entry) => entry.tag);
}

describe('packages/db/migrations', () => {
  it('has at least the migrations this project is known to carry', () => {
    // A sanity floor: if the glob silently matched nothing, every assertion
    // below would pass vacuously and guard nothing at all.
    expect(migrationFiles().length).toBeGreaterThanOrEqual(25);
  });

  it('never gives two migrations the same number', () => {
    const byNumber = new Map<string, string[]>();
    for (const file of migrationFiles()) {
      const number = file.slice(0, 4);
      byNumber.set(number, [...(byNumber.get(number) ?? []), file]);
    }

    const collisions = [...byNumber.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([number, files]) => `${number}: ${files.join(' and ')}`);

    // If this fails: renumber YOUR migration to the next free number, not the
    // one already on main. Keep dependent pairs in order — a migration that
    // repairs another must still run after it.
    expect(collisions).toEqual([]);
  });

  it('names every migration <NNNN>_<lower_snake_case>.sql', () => {
    const malformed = migrationFiles().filter((file) => !/^\d{4}_[a-z0-9_]+\.sql$/.test(file));
    expect(malformed).toEqual([]);
  });

  it('records every migration in the drizzle journal, and nothing that is missing', () => {
    // Hand-written migrations are journalled here too (0011, 0013 and others),
    // so drizzle-kit diffs against a snapshot that matches what actually ran.
    // A file with no entry is invisible to it; an entry with no file is a
    // migration somebody deleted or renamed without updating the journal.
    const stems = migrationFiles().map((file) => file.replace(/\.sql$/, ''));
    const tags = journalTags();

    expect(stems.filter((stem) => !tags.includes(stem))).toEqual([]);
    expect(tags.filter((tag) => !stems.includes(tag))).toEqual([]);
  });

  it('keeps journal entries in ascending order with no repeated index', () => {
    const tags = journalTags();
    const numbers = tags.map((tag) => Number(tag.slice(0, 4)));
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    expect(new Set(numbers).size).toBe(numbers.length);
  });
});
