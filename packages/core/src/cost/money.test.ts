import { describe, expect, it } from 'vitest';
import { currencyMinorDigits, formatMoney, parseMoneyInput } from './money';

const cents = (t: string, cur = 'USD', loc = 'en-US') => {
  const r = parseMoneyInput(t, cur, loc);
  return r.ok ? r.value : r.error;
};

describe('currencyMinorDigits', () => {
  it('ISO 4217', () => {
    expect(currencyMinorDigits('USD')).toBe(2);
    expect(currencyMinorDigits('JPY')).toBe(0);
    expect(currencyMinorDigits('KWD')).toBe(3);
  });
});

describe('formatMoney (FMT-01..05)', () => {
  it('formats', () => {
    expect(formatMoney(139, 'USD', 'en-US')).toBe('$1.39');
    expect(formatMoney(0, 'USD', 'en-US')).toBe('$0.00');
    expect(formatMoney(99999999, 'USD', 'en-US')).toBe('$999,999.99');
    expect(formatMoney(139, 'JPY', 'ja-JP').replace('￥', '¥')).toBe('¥139');
    expect(formatMoney(139, 'EUR', 'de-DE')).toBe(
      new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(1.39),
    );
    expect(formatMoney(1500, 'KWD', 'en-US')).toContain('1.500');
  });
});

describe('parseMoneyInput (MNY)', () => {
  it('MNY-01..06 en-US', () => {
    expect(cents('19.99')).toBe(1999);
    expect(cents('4.35')).toBe(435);
    expect(cents('0.29')).toBe(29);
    expect(cents('1.15')).toBe(115);
    expect(cents('$12')).toBe(1200);
    expect(cents('1,234.50')).toBe(123450);
    expect(cents('5.5')).toBe(550);
    expect(cents('.5')).toBe(50);
    expect(cents('  7  ')).toBe(700);
  });
  it('MNY-07 extra decimals are rejected, never rounded', () => {
    expect(cents('1.005')).toEqual({ code: 'tooManyDecimals', maxDecimals: 2 });
  });
  it('MNY-08 junk', () => {
    expect(cents('')).toEqual({ code: 'empty' });
    expect(cents('   ')).toEqual({ code: 'empty' });
    expect(cents('$')).toEqual({ code: 'empty' });
    expect(cents('abc')).toEqual({ code: 'notANumber' });
    expect(cents('1e3')).toEqual({ code: 'notANumber' });
    expect(cents('1.2.3')).toEqual({ code: 'notANumber' });
    expect(cents('12,34')).toEqual({ code: 'notANumber' });
    expect(cents('-1')).toEqual({ code: 'negative' });
    expect(cents('(5.00)')).toEqual({ code: 'negative' });
  });
  it('MNY-09/10 de-DE', () => {
    expect(cents('1.234,50', 'EUR', 'de-DE')).toBe(123450);
    expect(cents('1,5', 'EUR', 'de-DE')).toBe(150);
    expect(cents('1,99 €', 'EUR', 'de-DE')).toBe(199);
    expect(cents('1.5', 'EUR', 'de-DE')).toEqual({ code: 'notANumber' });
  });
  it('MNY-11 zero-digit currency', () => {
    expect(cents('¥1200', 'JPY', 'ja-JP')).toBe(1200);
    expect(cents('1200', 'JPY', 'en-US')).toBe(1200);
    expect(cents('12.5', 'JPY', 'en-US')).toEqual({ code: 'tooManyDecimals', maxDecimals: 0 });
  });
  it('three-digit currency', () => {
    expect(cents('1.500', 'KWD', 'en-US')).toBe(1500);
  });
  it('overflow is rejected', () => {
    expect(cents('9'.repeat(30))).toEqual({ code: 'notANumber' });
  });
});
