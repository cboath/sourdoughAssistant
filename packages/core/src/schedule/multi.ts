// Multi-recipe / multi-slot oven layout (ADR 0009) and the plan-level checks that depend on it.
//
// PROVISIONAL (AMB-10, Chris Q8): every rule that Chris may still change is kept in this file:
//   - greedy fill in item order, remainder in the last slot  -> assignOvenSlots (backward.ts) feeds `layoutSlots`
//   - slot length = longest bake in the slot                  -> `slotLengthMin`
//   - the LAST slot cools at readyAt                          -> `layoutSlots` (anchor choice, ADR 0009 section 4)
//   - reheat gap between slots (default 0)                    -> `DEFAULT_REHEAT_GAP_MIN`
// Switching the ready-time anchor to "first slot" means changing only `layoutSlots`.

import type { EpochMs, Id, Minutes } from '../types';
import type { OvenSlot, PlannedStep, PlanWarning } from './backward';

const MIN_MS = 60_000;

/** Provisional (Q8): no reheat gap between slots unless the setting says otherwise. */
export const DEFAULT_REHEAT_GAP_MIN: Minutes = 0;

export interface SlotAssignment {
  index: number; // 1-based
  loaves: { itemId: Id; loaves: number }[];
}
export interface ItemOvenTiming {
  ovenMin: Minutes;
  tailMin: Minutes;
}

/** Provisional rule: a slot is as long as the longest bake of the items in it. */
function slotLengthMin(slot: SlotAssignment, timing: ReadonlyMap<Id, ItemOvenTiming>): Minutes {
  return slot.loaves.reduce((m, l) => Math.max(m, timing.get(l.itemId)?.ovenMin ?? 0), 0);
}

/**
 * Places every oven slot (ADR 0009 section 4). The last slot starts so its latest finisher
 * (oven + tail) ends at `readyAt`; earlier slots run back to back, `reheatGapMin` apart.
 */
export function layoutSlots(
  slots: readonly SlotAssignment[],
  timing: ReadonlyMap<Id, ItemOvenTiming>,
  readyAt: EpochMs,
  reheatGapMin: Minutes = DEFAULT_REHEAT_GAP_MIN,
): OvenSlot[] {
  const out: OvenSlot[] = new Array<OvenSlot>(slots.length);
  let nextStart = 0;
  for (let k = slots.length - 1; k >= 0; k--) {
    const slot = slots[k]!;
    const length = slotLengthMin(slot, timing) * MIN_MS;
    let startAt: EpochMs;
    if (k === slots.length - 1) {
      const lead = slot.loaves.reduce((m, l) => {
        const t = timing.get(l.itemId);
        return Math.max(m, t ? t.ovenMin + t.tailMin : 0);
      }, 0);
      startAt = readyAt - lead * MIN_MS;
    } else {
      startAt = nextStart - reheatGapMin * MIN_MS - length;
    }
    out[k] = {
      index: slot.index,
      startAt,
      endAt: startAt + length,
      loaves: slot.loaves.map((l) => ({ ...l })),
    };
    nextStart = startAt;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Plan-level queries (shared by planning and live recompute)

/** Non-alongside oven-phase steps of one slot (kind 'bake'). */
function ovenSteps(steps: readonly PlannedStep[], slotIndex: number): PlannedStep[] {
  return steps.filter((s) => s.slotIndex === slotIndex && !s.isAlongside && s.kind === 'bake');
}

/** Slot windows re-derived from the plan's bake steps (after a recompute moved them). */
export function deriveSlots(steps: readonly PlannedStep[], slots: readonly OvenSlot[]): OvenSlot[] {
  return slots.map((slot) => {
    const bake = ovenSteps(steps, slot.index);
    if (bake.length === 0) return { ...slot, loaves: slot.loaves.map((l) => ({ ...l })) };
    return {
      ...slot,
      startAt: Math.min(...bake.map((s) => s.startAt)),
      endAt: Math.max(...bake.map((s) => s.endAt)),
      loaves: slot.loaves.map((l) => ({ ...l })),
    };
  });
}

/**
 * The item's hold step: the last pre-oven sequential step (cold ferment). Null when the item has
 * no oven phase or nothing before it.
 */
export function holdStepOf(steps: readonly PlannedStep[], itemId: Id): PlannedStep | null {
  const own = steps.filter((s) => s.itemId === itemId && !s.isAlongside);
  if (!own.some((s) => s.slotIndex !== null)) return null;
  let hold: PlannedStep | null = null;
  for (const s of own) {
    if (s.slotIndex === null && (hold === null || s.startAt >= hold.startAt)) hold = s;
  }
  return hold;
}

/** holdExceedsRange (ADR 0009 section 6) and ovenConflict (ADR 0009 section 10). */
export function slotWarnings(
  steps: readonly PlannedStep[],
  slots: readonly OvenSlot[],
): PlanWarning[] {
  const out: PlanWarning[] = [];

  const itemIds = [...new Set(steps.filter((s) => s.itemId !== null).map((s) => s.itemId as Id))];
  for (const itemId of itemIds) {
    const hold = holdStepOf(steps, itemId);
    if (!hold) continue;
    const trackSlots = [
      ...new Set(
        steps
          .filter((s) => s.itemId === itemId && !s.isAlongside && s.slotIndex !== null)
          .map((s) => s.slotIndex as number),
      ),
    ].sort((a, b) => a - b);
    let worst = 0;
    for (const k of trackSlots.slice(1)) {
      const trackStart = Math.min(
        ...steps
          .filter((s) => s.itemId === itemId && !s.isAlongside && s.slotIndex === k)
          .map((s) => s.startAt),
      );
      worst = Math.max(worst, Math.round((trackStart - hold.startAt) / MIN_MS));
    }
    if (worst > hold.maxMin) {
      out.push({
        code: 'holdExceedsRange',
        stepKey: hold.key,
        effectiveMin: worst,
        maxMin: hold.maxMin,
      });
    }
  }

  const sorted = [...slots].sort((a, b) => a.index - b.index);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i]!;
      const b = sorted[j]!;
      if (a.startAt < b.endAt && b.startAt < a.endAt) {
        out.push({ code: 'ovenConflict', slotIndexes: [a.index, b.index] });
      }
    }
  }
  return out;
}
