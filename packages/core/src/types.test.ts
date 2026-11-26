import { describe, expect, it } from 'vitest';
import { CoreInvariantError, err, ok, percent, roundHalfUp, roundToStep } from './types';

describe('rounding helpers', () => {
  it('roundHalfUp rounds half up and absorbs float noise', () => {
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(138.5)).toBe(139);
    expect(roundHalfUp(17.499999999999)).toBe(18);
    expect(roundHalfUp(2.4)).toBe(2);
    expect(roundHalfUp(0)).toBe(0);
  });
  it('roundToStep', () => {
    expect(roundToStep(17.3, 0.5)).toBe(17.5);
    expect(roundToStep(3.46, 0.1)).toBe(3.5);
    expect(() => roundToStep(1, 0)).toThrow(CoreInvariantError);
  });
  it('percent is half-up on the exact ratio (RCP-12)', () => {
    expect(percent(309, 400)).toBe(77.3);
    expect(percent(425, 550)).toBe(77.3);
    expect(percent(1, 3, 2)).toBe(33.33);
    expect(percent(1, 0)).toBeNull();
  });
  it('ok and err', () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 });
    expect(err('x')).toEqual({ ok: false, error: 'x' });
  });
});
