import { describe, expect, it } from 'vitest';
import { defaultTemplate } from './fixtures';
import { findOvenPhase, validateSteps, type StepTemplate } from './validate';

function errorsOf(steps: StepTemplate[]) {
  const r = validateSteps(steps);
  return r.ok ? [] : r.error;
}
const patch = (id: string, p: Partial<StepTemplate>) =>
  defaultTemplate().map((s) => (s.id === id ? { ...s, ...p } : s));

describe('validateSteps', () => {
  it('accepts the default template', () => {
    expect(validateSteps(defaultTemplate()).ok).toBe(true);
  });

  it('rejects an empty recipe', () => {
    expect(errorsOf([])).toEqual([{ code: 'emptyRecipe' }]);
  });

  it.each([
    ['min > default', { minMin: 70 }],
    ['default > max', { durationMin: 130 }],
    ['zero min', { minMin: 0 }],
    ['negative default', { durationMin: -5 }],
    ['non-integer', { durationMin: 60.5 }],
  ])('rangeInvalid: %s', (_n, p) => {
    expect(errorsOf(patch('mix', p))).toContainEqual({ code: 'rangeInvalid', stepId: 'mix' });
  });

  it('accepts min = default = max', () => {
    expect(validateSteps(patch('mix', { minMin: 60, maxMin: 60 })).ok).toBe(true);
  });

  it('foldDurationMismatch when stored duration is not count x interval', () => {
    expect(errorsOf(patch('folds', { durationMin: 100, minMin: 100, maxMin: 100 }))).toContainEqual(
      {
        code: 'foldDurationMismatch',
        stepId: 'folds',
      },
    );
    expect(errorsOf(patch('folds', { folds: { count: 0, intervalMin: 30 } }))).toContainEqual({
      code: 'foldDurationMismatch',
      stepId: 'folds',
    });
  });

  it('anchorMissing for an unknown or self anchor', () => {
    const a = { type: 'alongside', stepId: 'nope', align: 'endsAtStart' } as const;
    expect(errorsOf(patch('preheat', { anchor: a }))).toContainEqual({
      code: 'anchorMissing',
      stepId: 'preheat',
    });
    const self = { type: 'alongside', stepId: 'preheat', align: 'endsAtStart' } as const;
    expect(errorsOf(patch('preheat', { anchor: self }))).toContainEqual({
      code: 'anchorMissing',
      stepId: 'preheat',
    });
  });

  it('alongsideChain when an alongside step anchors to an alongside step', () => {
    const steps = [
      ...defaultTemplate(),
      {
        ...defaultTemplate()[6]!,
        id: 'extra',
        anchor: { type: 'alongside', stepId: 'preheat', align: 'startsAtStart' },
      } as StepTemplate,
    ];
    expect(errorsOf(steps)).toContainEqual({ code: 'alongsideChain', stepId: 'extra' });
  });

  it('rejects a two-step alongside cycle (A alongside B, B alongside A) and out-of-recipe anchors (SEC-01 M4)', () => {
    const tpl = defaultTemplate();
    const base = tpl[6]!;
    const a: StepTemplate = {
      ...base,
      id: 'A',
      anchor: { type: 'alongside', stepId: 'B', align: 'endsAtStart' },
    };
    const b: StepTemplate = {
      ...base,
      id: 'B',
      anchor: { type: 'alongside', stepId: 'A', align: 'endsAtStart' },
    };
    const errs = errorsOf([...tpl.filter((s) => s.id !== 'preheat'), a, b]);
    expect(errs).toContainEqual({ code: 'alongsideChain', stepId: 'A' });
    expect(errs).toContainEqual({ code: 'alongsideChain', stepId: 'B' });
    const outside: StepTemplate = {
      ...base,
      anchor: { type: 'alongside', stepId: 'from-another-recipe', align: 'endsAtStart' },
    };
    expect(errorsOf([...tpl.filter((s) => s.id !== 'preheat'), outside])).toContainEqual({
      code: 'anchorMissing',
      stepId: 'preheat',
    });
  });

  it('noSequentialSteps', () => {
    const only = defaultTemplate().filter((s) => s.id === 'preheat');
    expect(errorsOf(only)).toContainEqual({ code: 'noSequentialSteps' });
  });

  it('ovenPhaseNotContiguous when bake steps are separated', () => {
    const steps = defaultTemplate().map((s) =>
      s.id === 'shape' ? { ...s, kind: 'bake' as const } : s,
    );
    expect(errorsOf(steps)).toContainEqual({
      code: 'ovenPhaseNotContiguous',
      stepIds: ['shape', 'bakeCovered', 'bakeUncovered'],
    });
  });

  it('reports every error found', () => {
    const steps = patch('mix', { minMin: 0 }).map((s) =>
      s.id === 'shape' ? { ...s, maxMin: 1 } : s,
    );
    expect(errorsOf(steps)).toHaveLength(2);
  });
});

describe('findOvenPhase', () => {
  it('finds the oven phase, tail and hold step', () => {
    const steps = defaultTemplate();
    const p = findOvenPhase(steps)!;
    expect(p.indexes.map((i) => steps[i]!.id)).toEqual(['bakeCovered', 'bakeUncovered']);
    expect(p.tailIndexes.map((i) => steps[i]!.id)).toEqual(['cool']);
    expect(steps[p.holdIndex!]!.id).toBe('cold');
  });

  it('returns null without a bake step', () => {
    expect(findOvenPhase(defaultTemplate().filter((s) => s.kind !== 'bake'))).toBeNull();
  });
});
