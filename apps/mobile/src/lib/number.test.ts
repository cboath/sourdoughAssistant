import { decimalSeparator, formatNumberInput, parseNumberInput } from './number';

describe('parseNumberInput', () => {
  it('parses integers and decimals', () => {
    expect(parseNumberInput('450', 'en-US')).toEqual({ ok: true, value: 450, decimals: 0 });
    expect(parseNumberInput('2.5', 'en-US')).toEqual({ ok: true, value: 2.5, decimals: 1 });
    expect(parseNumberInput(' .5 ', 'en-US')).toEqual({ ok: true, value: 0.5, decimals: 1 });
  });

  it('uses the locale decimal separator', () => {
    expect(decimalSeparator('de-DE')).toBe(',');
    expect(parseNumberInput('2,5', 'de-DE')).toEqual({ ok: true, value: 2.5, decimals: 1 });
  });

  it('rejects empty and non-numeric text', () => {
    expect(parseNumberInput('  ', 'en-US')).toEqual({ ok: false, reason: 'empty' });
    expect(parseNumberInput('abc', 'en-US')).toEqual({ ok: false, reason: 'nan' });
    expect(parseNumberInput('1.2.3', 'en-US')).toEqual({ ok: false, reason: 'nan' });
    expect(parseNumberInput('-5', 'en-US')).toEqual({ ok: false, reason: 'nan' });
    expect(parseNumberInput('.', 'en-US')).toEqual({ ok: false, reason: 'nan' });
  });
});

describe('formatNumberInput', () => {
  it('formats without grouping', () => {
    expect(formatNumberInput(1234.5, 'en-US')).toBe('1234.5');
    expect(formatNumberInput(2.5, 'de-DE')).toBe('2,5');
    expect(formatNumberInput(236.5882365, 'en-US', 2)).toBe('236.59');
  });
});
