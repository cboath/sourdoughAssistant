import { describe, expect, it } from 'vitest';
import { formatAmount } from './format';

const flour = { gramsPerCup: 120 };

describe('formatAmount', () => {
  it('us with density: cups to nearest quarter', () => {
    expect(formatAmount(270, { unitSystem: 'us', locale: 'en-US', factors: flour })).toEqual({
      primary: '270 g',
      secondary: '2 ¼ cups',
    });
    expect(formatAmount(120, { unitSystem: 'us', locale: 'en-US', factors: flour }).secondary).toBe(
      '1 cup',
    );
    expect(formatAmount(60, { unitSystem: 'us', locale: 'en-US', factors: flour }).secondary).toBe(
      '½ cup',
    );
  });
  it('under 15 g uses spoons', () => {
    expect(formatAmount(7.5, { unitSystem: 'us', locale: 'en-US', factors: flour }).secondary).toBe(
      '1 tbsp',
    );
    expect(formatAmount(2.5, { unitSystem: 'us', locale: 'en-US', factors: flour }).secondary).toBe(
      '1 tsp',
    );
    expect(formatAmount(10, { unitSystem: 'us', locale: 'en-US', factors: flour }).secondary).toBe(
      '1 ¼ tbsp',
    );
  });
  it('metric or no density gives oz to 1 dp', () => {
    expect(formatAmount(454, { unitSystem: 'metric', locale: 'en-US', factors: flour })).toEqual({
      primary: '454 g',
      secondary: '16 oz',
    });
    expect(formatAmount(100, { unitSystem: 'us', locale: 'en-US' }).secondary).toBe('3.5 oz');
  });
  it('uses locale number formatting', () => {
    expect(formatAmount(1234.4, { unitSystem: 'metric', locale: 'de-DE' }).primary).toBe('1.234 g');
    expect(formatAmount(100, { unitSystem: 'metric', locale: 'de-DE' }).secondary).toBe('3,5 oz');
  });
  it('small amounts keep one decimal', () => {
    expect(formatAmount(2.46, { unitSystem: 'metric', locale: 'en-US' }).primary).toBe('2.5 g');
  });
});
