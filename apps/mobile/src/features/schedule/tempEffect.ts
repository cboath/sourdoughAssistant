/** What a kitchen temperature does to temperature-sensitive steps (screens-bake.md 3.2, 3.4). */
import { chooseDurations, type StepTemplate } from '@sourdough/core';

export interface TempEffect {
  itemIndex: number;
  stepName: string;
  minutes: number;
  recipeMinutes: number;
  /** The temperature result was clamped to the step's range. */
  capped: boolean;
  /** The unclamped result, when capped. */
  rawMinutes: number | null;
}

/** One entry per recipe that has a temperature-sensitive step, using its first such step. */
export function tempEffects(
  items: ReadonlyArray<{ steps: readonly StepTemplate[] }>,
  tempC: number,
): TempEffect[] {
  const effects: TempEffect[] = [];
  items.forEach((item, itemIndex) => {
    const step = item.steps.find((s) => s.tempSensitive && s.anchor.type === 'sequential');
    if (!step) return;
    const result = chooseDurations(item.steps, { kitchenTempC: tempC });
    const choice = result.ok ? result.value[step.id] : undefined;
    if (!choice) return;
    effects.push({
      itemIndex,
      stepName: step.name,
      minutes: choice.minutes,
      recipeMinutes: step.durationMin,
      capped: choice.clamped,
      rawMinutes: choice.unclampedMinutes,
    });
  });
  return effects;
}
