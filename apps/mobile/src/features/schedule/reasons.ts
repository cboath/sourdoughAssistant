/** Plain-language reasons a recipe can't be scheduled (screens-bake.md 3.9). */
import { validateSteps, type StepTemplate, type StepValidationError } from '@sourdough/core';
import { t, type MessageKey } from '../../lib/i18n';

export function reasonText(error: StepValidationError, steps: readonly StepTemplate[]): string {
  const stepId = 'stepId' in error ? error.stepId : undefined;
  const step = stepId ? (steps.find((s) => s.id === stepId)?.name ?? '') : '';
  return t(`plan.reason.${error.code}` as MessageKey, { step });
}

/** The first reason a recipe fails validation, or null when it can be scheduled. */
export function firstReason(steps: readonly StepTemplate[]): string | null {
  const result = validateSteps(steps);
  const first = result.ok ? undefined : result.error[0];
  return first ? reasonText(first, steps) : null;
}
