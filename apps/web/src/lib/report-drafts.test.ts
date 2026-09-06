import { describe, expect, it } from 'vitest';
import { describeAge, sortDraftsByAge } from './report-drafts';
import type { ReportDraftRecord } from './db';

function draft(key: string, savedAt: number): ReportDraftRecord {
  return { key, traineeName: key.toUpperCase(), savedAt };
}

describe('sortDraftsByAge', () => {
  it('puts the report held longest at the top — it is the one most likely forgotten', () => {
    const sorted = sortDraftsByAge([draft('new', 3_000), draft('old', 1_000), draft('mid', 2_000)]);
    expect(sorted.map((d) => d.key)).toEqual(['old', 'mid', 'new']);
  });

  it('does not mutate the list it was given', () => {
    const drafts = [draft('b', 2), draft('a', 1)];
    sortDraftsByAge(drafts);
    expect(drafts.map((d) => d.key)).toEqual(['b', 'a']);
  });
});

describe('describeAge', () => {
  const now = new Date('2026-09-06T12:00:00Z').getTime();
  const ago = (ms: number) => now - ms;

  it('says "just now" inside the first minute', () => {
    expect(describeAge(ago(0), now)).toBe('just now');
    expect(describeAge(ago(59_000), now)).toBe('just now');
  });

  it('counts minutes, then hours, then days', () => {
    expect(describeAge(ago(60_000), now)).toBe('1 minute ago');
    expect(describeAge(ago(45 * 60_000), now)).toBe('45 minutes ago');
    expect(describeAge(ago(60 * 60_000), now)).toBe('1 hour ago');
    expect(describeAge(ago(5 * 60 * 60_000), now)).toBe('5 hours ago');
    expect(describeAge(ago(24 * 60 * 60_000), now)).toBe('1 day ago');
    expect(describeAge(ago(3 * 24 * 60 * 60_000), now)).toBe('3 days ago');
  });

  it('never reads as a negative age when a device clock runs behind', () => {
    expect(describeAge(now + 60_000, now)).toBe('just now');
  });
});
