import {
  clampDay,
  daysInMonth,
  displayLocalDate,
  formatLocalDate,
  parseLocalDate,
  todayLocalDate,
} from './localDate';

describe('localDate', () => {
  it('knows month lengths including leap years', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it('parses and rejects', () => {
    expect(parseLocalDate('2026-11-26')).toEqual({ year: 2026, month: 11, day: 26 });
    expect(parseLocalDate('2026-02-30')).toBeNull();
    expect(parseLocalDate('26-11-2026')).toBeNull();
    expect(parseLocalDate('2026-13-01')).toBeNull();
  });

  it('formats with padding and clamps the day', () => {
    expect(formatLocalDate({ year: 2026, month: 3, day: 4 })).toBe('2026-03-04');
    expect(clampDay({ year: 2026, month: 2, day: 31 })).toEqual({ year: 2026, month: 2, day: 28 });
  });

  it('uses the local calendar day for today', () => {
    expect(todayLocalDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('displays in the locale without shifting the day', () => {
    expect(displayLocalDate('2026-11-26', 'en-US')).toBe('Nov 26, 2026');
    expect(displayLocalDate('nope', 'en-US')).toBe('nope');
  });
});
