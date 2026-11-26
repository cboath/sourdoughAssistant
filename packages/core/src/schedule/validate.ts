// Step model and validation (docs/core-api.md 5.1, ADR 0010 sections 2, 3, 4).

import { err, ok, type Id, type Minutes, type Result } from '../types';

export type StepKind =
  | 'feed'
  | 'mix'
  | 'fold'
  | 'bulk'
  | 'shape'
  | 'proof'
  | 'coldProof'
  | 'preheat'
  | 'bake'
  | 'cool'
  | 'other';
export type AlongsideAlign = 'endsAtStart' | 'startsAtStart' | 'endsAtEnd';
export type StepAnchor =
  | { type: 'sequential' }
  | { type: 'alongside'; stepId: Id; align: AlongsideAlign; offsetMin?: Minutes };

export interface StepTemplate {
  id: Id;
  name: string;
  kind: StepKind;
  durationMin: Minutes; // recipe default; for fold steps it's derived = count * interval
  minMin: Minutes;
  maxMin: Minutes;
  tempSensitive: boolean;
  anchor: StepAnchor;
  folds: { count: number; intervalMin: Minutes } | null;
  notify: boolean;
}

export type StepValidationError =
  | { code: 'emptyRecipe' }
  | { code: 'rangeInvalid'; stepId: Id }
  | { code: 'foldDurationMismatch'; stepId: Id }
  | { code: 'anchorMissing'; stepId: Id }
  | { code: 'alongsideChain'; stepId: Id }
  | { code: 'noSequentialSteps' }
  | { code: 'ovenPhaseNotContiguous'; stepIds: Id[] }
  | { code: 'noOvenPhase' }
  | { code: 'overrideOutOfRange'; stepId: Id; minutes: Minutes };

/** Derived duration of a fold step (ADR 0010 section 3), or null for a non-fold step. */
export function foldDerivedMin(step: StepTemplate): Minutes | null {
  return step.folds ? step.folds.count * step.folds.intervalMin : null;
}

/** The recipe's oven phase: its contiguous run of sequential `bake` steps, as indexes into `steps`. */
export interface OvenPhase {
  /** Step indexes of the oven phase, in order. */
  indexes: number[];
  /** Sequential steps after the oven phase (the tail, e.g. Cool). */
  tailIndexes: number[];
  /** Last sequential step before the oven phase (the hold step, e.g. cold ferment), or null. */
  holdIndex: number | null;
}

/** Returns null when the recipe has no sequential `bake` step. Assumes the steps are contiguous (see validateSteps). */
export function findOvenPhase(steps: readonly StepTemplate[]): OvenPhase | null {
  const seq: number[] = [];
  steps.forEach((s, i) => {
    if (s.anchor.type === 'sequential') seq.push(i);
  });
  const bakePos = seq.filter((i) => steps[i]!.kind === 'bake');
  if (bakePos.length === 0) return null;
  const firstPos = seq.indexOf(bakePos[0]!);
  const lastPos = seq.indexOf(bakePos[bakePos.length - 1]!);
  return {
    indexes: seq.slice(firstPos, lastPos + 1),
    tailIndexes: seq.slice(lastPos + 1),
    holdIndex: firstPos > 0 ? seq[firstPos - 1]! : null,
  };
}

const isPosInt = (n: number) => Number.isInteger(n) && n > 0;

export function validateSteps(steps: readonly StepTemplate[]): Result<void, StepValidationError[]> {
  if (steps.length === 0) return err([{ code: 'emptyRecipe' }]);

  const errors: StepValidationError[] = [];
  const byId = new Map<Id, StepTemplate>();
  for (const s of steps) byId.set(s.id, s);

  for (const s of steps) {
    if (s.folds) {
      const derived = s.folds.count * s.folds.intervalMin;
      if (
        !isPosInt(s.folds.count) ||
        !isPosInt(s.folds.intervalMin) ||
        s.durationMin !== derived ||
        s.minMin !== derived ||
        s.maxMin !== derived
      ) {
        errors.push({ code: 'foldDurationMismatch', stepId: s.id });
      }
    } else if (
      !isPosInt(s.minMin) ||
      !isPosInt(s.durationMin) ||
      !isPosInt(s.maxMin) ||
      !(s.minMin <= s.durationMin && s.durationMin <= s.maxMin)
    ) {
      errors.push({ code: 'rangeInvalid', stepId: s.id });
    }

    if (s.anchor.type === 'alongside') {
      const target = byId.get(s.anchor.stepId);
      if (!target || target.id === s.id) {
        errors.push({ code: 'anchorMissing', stepId: s.id });
      } else if (target.anchor.type === 'alongside') {
        errors.push({ code: 'alongsideChain', stepId: s.id });
      }
    }
  }

  const sequential = steps.filter((s) => s.anchor.type === 'sequential');
  if (sequential.length === 0) {
    errors.push({ code: 'noSequentialSteps' });
  } else {
    const bakeIdx = sequential.map((s, i) => (s.kind === 'bake' ? i : -1)).filter((i) => i >= 0);
    const first = bakeIdx[0];
    const last = bakeIdx[bakeIdx.length - 1];
    if (first !== undefined && last !== undefined && last - first + 1 !== bakeIdx.length) {
      errors.push({
        code: 'ovenPhaseNotContiguous',
        stepIds: bakeIdx.map((i) => sequential[i]!.id),
      });
    }
  }

  return errors.length > 0 ? err(errors) : ok(undefined);
}
