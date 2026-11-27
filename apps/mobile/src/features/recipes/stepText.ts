/** Display text for process steps, shared by the editor and the detail screen. */
import type { StepTemplate } from '@sourdough/core';
import { t, tp, type MessageKey } from '../../lib/i18n';
import { formatDuration, formatRange, spokenDuration } from './format';

const alignText = (align: 'endsAtStart' | 'startsAtStart' | 'endsAtEnd'): string =>
  t(`step.align.${align}` as MessageKey, { step: t('step.align.it') }).toLocaleLowerCase();

/** "6 h · 5–8 h", "10 min", "4 folds, every 30 min · 2 h", "Alongside Bake, covered · ends when it starts". */
export function stepSubtitle(
  step: StepTemplate,
  steps: readonly StepTemplate[],
  locale: string,
): string {
  if (step.anchor.type === 'alongside') {
    const anchor = step.anchor;
    const target = steps.find((s) => s.id === anchor.stepId);
    return t('edit.step.alongsideSub', {
      step: target?.name ?? '?',
      alignText: alignText(anchor.align),
    });
  }
  if (step.folds) {
    return tp('edit.step.foldsSub', step.folds.count, {
      interval: formatDuration(step.folds.intervalMin, locale),
      total: formatDuration(step.durationMin, locale),
    });
  }
  const duration = formatDuration(step.durationMin, locale);
  return step.minMin !== step.maxMin || step.durationMin !== step.minMin
    ? `${duration} · ${formatRange(step.minMin, step.maxMin, locale)}`
    : duration;
}

/** Spoken row label: "Step 4, Bulk ferment, 6 hours, range 5 to 8 hours, temperature-sensitive." */
export function stepLabel(
  step: StepTemplate,
  index: number,
  steps: readonly StepTemplate[],
  locale: string,
): string {
  const parts: string[] = [];
  if (step.anchor.type === 'alongside') {
    const anchor = step.anchor;
    const target = steps.find((s) => s.id === anchor.stepId);
    parts.push(
      `${step.name}, ${t('detail.alongside', { step: target?.name ?? '?' })}, ${alignText(anchor.align)}, ${spokenDuration(step.durationMin, locale)}`,
    );
  } else {
    parts.push(t('edit.step.rowLabel', { n: index + 1, name: step.name }));
    if (step.folds) parts.push(stepSubtitle(step, steps, locale));
    else {
      parts.push(spokenDuration(step.durationMin, locale));
      if (step.minMin !== step.maxMin) {
        parts.push(
          `range ${spokenDuration(step.minMin, locale)} to ${spokenDuration(step.maxMin, locale)}`,
        );
      }
    }
  }
  if (step.tempSensitive) parts.push(t('edit.step.tempTag').toLocaleLowerCase());
  if (!step.notify) parts.push(t('edit.step.noReminder').toLocaleLowerCase());
  return `${parts.join(', ')}.`;
}
