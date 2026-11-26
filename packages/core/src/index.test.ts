import { describe, expect, it } from 'vitest';
import * as core from './index';

describe('public barrel', () => {
  it('exposes the documented entry points and no internals', () => {
    for (const name of [
      'planBake',
      'planSpanMin',
      'earliestReadyAt',
      'assignOvenSlots',
      'recomputePlan',
      'holdCapacity',
      'greeting',
      'hydrationPct',
      'costBreakdown',
      'localToUtc',
    ]) {
      expect(typeof (core as Record<string, unknown>)[name]).toBe('function');
    }
    for (const name of [
      'prepareItems',
      'layoutItem',
      'layoutSlots',
      'defaultTemplate',
      'findOvenPhase',
    ]) {
      expect(name in core).toBe(false);
    }
  });
});
