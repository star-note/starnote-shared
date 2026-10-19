import { describe, expect, it } from 'vitest';

import { formatDate, readingMinutes } from '../format';

describe('formatDate', () => {
  const d = new Date(2026, 9, 5, 8, 7);
  it('covers the shapes the platform pages use', () => {
    expect(formatDate(d, 'YYYY 年 M 月 D 日')).toBe('2026 年 10 月 5 日');
    expect(formatDate(d, 'YYYY年M月D日 HH:mm')).toBe('2026年10月5日 08:07');
    expect(formatDate(d, 'MM-DD')).toBe('10-05');
    expect(formatDate(d, 'YYYY-MM-DD HH:mm')).toBe('2026-10-05 08:07');
    expect(formatDate(d, 'MMM D, YYYY')).toBe('Oct 5, 2026');
    expect(formatDate('not a date', 'YYYY')).toBe('');
  });
  it('reads 400 characters a minute, at least one', () => {
    expect(readingMinutes(0)).toBe(1);
    expect(readingMinutes(1200)).toBe(3);
    expect(readingMinutes(null)).toBe(1);
  });
});
