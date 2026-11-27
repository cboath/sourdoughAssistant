/** Pure state, validation and wording for the step editor (screens-recipes.md section 9). */
import { validateSteps, type AlongsideAlign, type StepKind } from '@sourdough/core';
import { t, type MessageKey } from '../../lib/i18n';
import { LIMITS, cleanName, cleanNotes } from '../../lib/sanitize';
import { formatDuration } from './format';
import type { DraftStep } from './draft';

export interface StepFormState {
  name: string;
  kind: StepKind;
  timing: 'duration' | 'folds';
  defaultMin: number;
  /** "No range": min and max follow the default. */
  noRange: boolean;
  minMin: number;
  maxMin: number;
  foldCount: number;
  foldIntervalMin: number;
  tempSensitive: boolean;
  alongside: boolean;
  anchorStepId: string | null;
  align: AlongsideAlign;
  offsetMin: number;
  offsetDir: 'earlier' | 'later';
  notify: boolean;
  notes: string;
}

export type StepFormErrors = Partial<
  Record<'name' | 'default' | 'min' | 'folds' | 'anchor' | 'offset' | 'step', string>
>;

export const STEP_KINDS: readonly StepKind[] = [
  'feed',
  'mix',
  'fold',
  'bulk',
  'shape',
  'proof',
  'coldProof',
  'preheat',
  'bake',
  'cool',
  'other',
];

export const kindLabel = (kind: StepKind): string => t(`step.kind.${kind}` as MessageKey);

const MAX_STEP_MIN = 7 * 24 * 60;

export function newStepState(): StepFormState {
  return {
    name: '',
    kind: 'other',
    timing: 'duration',
    defaultMin: 30,
    noRange: true,
    minMin: 30,
    maxMin: 30,
    foldCount: 4,
    foldIntervalMin: 30,
    tempSensitive: false,
    alongside: false,
    anchorStepId: null,
    align: 'endsAtStart',
    offsetMin: 0,
    offsetDir: 'earlier',
    notify: true,
    notes: '',
  };
}

export function stateFromStep(step: DraftStep): StepFormState {
  const base = newStepState();
  const offset = step.anchor.type === 'alongside' ? (step.anchor.offsetMin ?? 0) : 0;
  return {
    ...base,
    name: step.name,
    kind: step.kind,
    timing: step.folds ? 'folds' : 'duration',
    defaultMin: step.durationMin,
    noRange: step.minMin === step.durationMin && step.maxMin === step.durationMin,
    minMin: step.minMin,
    maxMin: step.maxMin,
    foldCount: step.folds?.count ?? base.foldCount,
    foldIntervalMin: step.folds?.intervalMin ?? base.foldIntervalMin,
    tempSensitive: step.tempSensitive,
    alongside: step.anchor.type === 'alongside',
    anchorStepId: step.anchor.type === 'alongside' ? step.anchor.stepId : null,
    align: step.anchor.type === 'alongside' ? step.anchor.align : 'endsAtStart',
    offsetMin: Math.abs(offset),
    offsetDir: offset > 0 ? 'later' : 'earlier',
    notify: step.notify,
    notes: step.notes,
  };
}

/** The "{name} ends 10 min before {step} starts." sentence, or null without an anchor. */
export function previewSentence(
  state: StepFormState,
  anchorName: string | null,
  locale: string,
): string | null {
  if (!state.alongside || !anchorName) return null;
  const when = state.offsetMin === 0 ? 'none' : state.offsetDir === 'earlier' ? 'before' : 'after';
  return t(`step.preview.${state.align}.${when}` as MessageKey, {
    name: state.name.trim() || t('step.titleNew'),
    step: anchorName,
    offset: formatDuration(state.offsetMin, locale),
  });
}

export function toStep(state: StepFormState, id: string): DraftStep {
  const folds = state.timing === 'folds';
  const duration = folds ? state.foldCount * state.foldIntervalMin : state.defaultMin;
  const noRange = folds || state.noRange;
  const offset = state.offsetDir === 'earlier' ? -state.offsetMin : state.offsetMin;
  return {
    id,
    name: cleanName(state.name, LIMITS.stepName),
    kind: state.kind,
    durationMin: duration,
    minMin: noRange ? duration : state.minMin,
    maxMin: noRange ? duration : state.maxMin,
    tempSensitive: state.tempSensitive,
    anchor:
      state.alongside && state.anchorStepId
        ? { type: 'alongside', stepId: state.anchorStepId, align: state.align, offsetMin: offset }
        : { type: 'sequential' },
    folds: folds ? { count: state.foldCount, intervalMin: state.foldIntervalMin } : null,
    notify: state.notify,
    notes: cleanNotes(state.notes, LIMITS.stepNotes),
  };
}

export function validateStepForm(
  state: StepFormState,
  stepId: string,
  others: readonly DraftStep[],
  /** Position for the step when it is new (appended). */
  index: number,
): { errors: StepFormErrors; step: DraftStep | null } {
  const errors: StepFormErrors = {};
  const name = cleanName(state.name, 1000);
  if (name === '') errors.name = t('val.name.empty');
  else if (Array.from(name).length > LIMITS.stepName) {
    errors.name = t('val.name.long', { max: LIMITS.stepName });
  }

  if (state.timing === 'folds') {
    if (state.foldIntervalMin < 5 || state.foldIntervalMin > 180) {
      errors.folds = t('val.folds.interval');
    } else if (state.foldCount * state.foldIntervalMin > MAX_STEP_MIN) {
      errors.folds = t('val.duration.max');
    }
  } else {
    if (state.defaultMin <= 0) errors.default = t('val.duration.zero');
    else if (state.defaultMin > MAX_STEP_MIN || state.maxMin > MAX_STEP_MIN) {
      errors.default = t('val.duration.max');
    }
    if (!state.noRange && !errors.default) {
      if (state.minMin > state.maxMin) errors.min = t('val.range.minMax');
      else if (state.defaultMin < state.minMin || state.defaultMin > state.maxMin) {
        errors.default = t('val.range.default');
      }
    }
  }

  if (state.alongside) {
    if (!state.anchorStepId) errors.anchor = t('val.step.anchor');
    if (state.offsetMin > 1440) errors.offset = t('val.offset.max');
  }

  if (Object.keys(errors).length > 0) return { errors, step: null };
  const step = toStep(state, stepId);
  // Check the whole list with this step applied; only this step's errors block Done.
  const list = [...others];
  list.splice(Math.min(index, list.length), 0, step);
  const result = validateSteps(list);
  if (!result.ok) {
    for (const error of result.error) {
      if ('stepId' in error && error.stepId === stepId) {
        errors.step =
          error.code === 'alongsideChain'
            ? t('val.step.chain')
            : error.code === 'anchorMissing'
              ? t('val.step.anchor')
              : error.code === 'foldDurationMismatch'
                ? t('val.step.folds')
                : t('val.step.range');
      }
      if (error.code === 'ovenPhaseNotContiguous' && error.stepIds.includes(stepId)) {
        errors.step = t('val.step.ovenPhase');
      }
    }
  }
  return Object.keys(errors).length > 0 ? { errors, step: null } : { errors, step };
}
