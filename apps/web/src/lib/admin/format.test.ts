import { describe, expect, it } from 'vitest';
import { auditActionText, countOf, formatDate, formatTimestamp, percentOf } from './format';

describe('formatTimestamp', () => {
  it('renders in East Africa Time, not the server’s UTC', () => {
    // 22:30 UTC is 01:30 the NEXT day in Morogoro — the case that makes an
    // audit trail read wrong if the timezone is left to the runtime.
    expect(formatTimestamp('2026-09-05T22:30:00Z')).toBe('06 Sep 2026, 01:30');
  });

  it('uses a 24-hour clock', () => {
    expect(formatTimestamp('2026-09-05T13:05:00Z')).toBe('05 Sep 2026, 16:05');
  });

  it('shows a dash rather than "Invalid Date"', () => {
    expect(formatTimestamp(null)).toBe('—');
    expect(formatTimestamp(undefined)).toBe('—');
    expect(formatTimestamp('not a date')).toBe('—');
  });
});

describe('formatDate', () => {
  it('renders the East African calendar day', () => {
    expect(formatDate('2026-09-05T22:30:00Z')).toBe('06 Sep 2026');
    expect(formatDate(null)).toBe('—');
  });
});

describe('auditActionText', () => {
  it('turns TG_OP into English', () => {
    expect(auditActionText('INSERT', 'trainees')).toBe('Added a trainee');
    expect(auditActionText('UPDATE', 'routes')).toBe('Changed a route');
    expect(auditActionText('DELETE', 'assignments')).toBe('Removed an assessor assignment');
  });

  it('falls back readably for a table it has no noun for', () => {
    expect(auditActionText('UPDATE', 'audit_log')).toBe('Changed audit log');
  });

  it('keeps an unexpected action visible instead of swallowing it', () => {
    expect(auditActionText('TRUNCATE', 'trainees')).toBe('TRUNCATE · a trainee');
  });
});

describe('countOf / percentOf', () => {
  it('counts', () => {
    expect(countOf(12, 41)).toBe('12 of 41');
    expect(countOf(0, 0)).toBe('none');
  });

  it('never divides by zero', () => {
    expect(percentOf(3, 0)).toBe(0);
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(41, 41)).toBe(100);
  });
});
