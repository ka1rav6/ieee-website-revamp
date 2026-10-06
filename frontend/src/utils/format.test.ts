import { describe, expect, it } from 'vitest';
import {
  compactNumber,
  cx,
  displayHost,
  formatDate,
  getYear,
  initials,
  isUpcoming,
  parseDate,
} from './format';

describe('parseDate', () => {
  it('reads a plain API date in local time', () => {
    const date = parseDate('2026-03-13');

    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(2);
    // The day must survive regardless of the viewer's timezone - parsing
    // "2026-03-13" as UTC would land on the 12th anywhere behind UTC.
    expect(date?.getDate()).toBe(13);
  });

  it('returns null for missing or unreadable values', () => {
    expect(parseDate(null)).toBeNull();
    expect(parseDate(undefined)).toBeNull();
    expect(parseDate('')).toBeNull();
    expect(parseDate('not a date')).toBeNull();
  });
});

describe('formatDate', () => {
  it('formats a date for display', () => {
    expect(formatDate('2026-03-13')).toContain('2026');
    expect(formatDate('2026-03-13')).toContain('March');
  });

  it('returns null when there is no date', () => {
    // Most imported posts carry no date, so callers rely on this to decide
    // whether to render the element at all.
    expect(formatDate(null)).toBeNull();
  });
});

describe('getYear', () => {
  it('extracts the year', () => {
    expect(getYear('2023-04-19')).toBe(2023);
  });

  it('returns null without a date', () => {
    expect(getYear(null)).toBeNull();
  });
});

describe('isUpcoming', () => {
  it('treats a future date as upcoming', () => {
    expect(isUpcoming('2099-01-01')).toBe(true);
  });

  it('treats a past date as not upcoming', () => {
    expect(isUpcoming('2020-01-01')).toBe(false);
  });

  it('treats a missing date as not upcoming', () => {
    expect(isUpcoming(null)).toBe(false);
  });

  it('counts today as upcoming', () => {
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
      today.getDate(),
    ).padStart(2, '0')}`;

    expect(isUpcoming(iso)).toBe(true);
  });
});

describe('initials', () => {
  it('uses the first and last name', () => {
    expect(initials('Anshul Kumar Singh')).toBe('AS');
  });

  it('handles a single name', () => {
    expect(initials('Sidharth')).toBe('SI');
  });

  it('drops an academic title', () => {
    expect(initials('Dr. Ranjitha Prasad')).toBe('RP');
  });

  it('survives an empty name', () => {
    expect(initials('')).toBe('?');
  });
});

describe('compactNumber', () => {
  it('leaves small numbers alone', () => {
    expect(compactNumber(0)).toBe('0');
    expect(compactNumber(52)).toBe('52');
    expect(compactNumber(999)).toBe('999');
  });

  it('abbreviates thousands', () => {
    expect(compactNumber(1000)).toBe('1k');
    expect(compactNumber(1500)).toBe('1.5k');
  });
});

describe('displayHost', () => {
  it('strips the scheme and www', () => {
    expect(displayHost('https://www.devfolio.co/events')).toBe('devfolio.co');
  });

  it('returns null for a value that is not a URL', () => {
    expect(displayHost('not a url')).toBeNull();
    expect(displayHost(null)).toBeNull();
  });
});

describe('cx', () => {
  it('joins truthy class names', () => {
    expect(cx('a', 'b')).toBe('a b');
  });

  it('drops falsy values', () => {
    expect(cx('a', false, null, undefined, 'b')).toBe('a b');
  });
});
