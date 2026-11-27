/**
 * Display labels for planned steps and oven slots (ADR 0009 section 6). Core's `PlannedStep.name`
 * is always the plain step name; the app composes slot and loaf text here, so the schedule
 * screen, the live view and notifications say the same thing.
 */
import type { OvenSlot, PlannedStep } from '@sourdough/core';
import { t, tp } from '../../lib/i18n';

export const MAX_RECIPES_PER_BAKE = 4;

const LETTERS = ['A', 'B', 'C', 'D'] as const;

/** `A` to `D` by item position (max four recipes per bake, so letters never repeat). */
export const letterFor = (index: number): string => LETTERS[index] ?? String(index + 1);

export interface StepLabelContext {
  /** Number of oven slots in the bake. */
  slotCount: number;
  /** Total loaves of the step's item, to say "1 of 3 loaves". */
  itemLoaves?: number;
}

/** "Bake, covered" for plain steps; "Bake, covered · 1 of 3 loaves · slot 2" when loaves are split across slots. */
export function stepLabel(
  step: Pick<PlannedStep, 'name' | 'slotIndex' | 'loaves'>,
  ctx: StepLabelContext,
): string {
  if (step.slotIndex === null || ctx.slotCount <= 1 || step.loaves === null || !ctx.itemLoaves) {
    return step.name;
  }
  return t('plan.step.slotLabel', {
    name: step.name,
    loaves: step.loaves,
    total: ctx.itemLoaves,
    slot: step.slotIndex,
  });
}

/** Contents of a slot: "A ×2, B ×1" for several recipes, "2 loaves" for one. */
export function slotContents(
  slot: OvenSlot,
  multiRecipe: boolean,
  itemIndexById: Map<string, number>,
): string {
  if (!multiRecipe) {
    const total = slot.loaves.reduce((sum, l) => sum + l.loaves, 0);
    return tp('plan.slot.contentsSingle', total);
  }
  return slot.loaves
    .map((l) =>
      t('plan.slot.contentsItem', {
        letter: letterFor(itemIndexById.get(l.itemId) ?? 0),
        loaves: l.loaves,
      }),
    )
    .join(', ');
}
