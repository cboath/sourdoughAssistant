/**
 * Simultaneous steps (screens-bake.md 0.3, architecture Q-A6). Core has no warning for this, so
 * the app derives it: two step starts from different items (or an item and the bake-wide
 * preheat) within a short window. Steps in the same oven slot go in together by design.
 */
import type { PlannedStep } from '@sourdough/core';

export const OVERLAP_WINDOW_MS = 10 * 60_000;

export interface OverlapPair {
  a: string;
  b: string;
}

const sameSlot = (a: PlannedStep, b: PlannedStep): boolean =>
  a.slotIndex !== null && a.slotIndex === b.slotIndex;

/** Unordered pairs, ordered by the earlier step. Never reports a step against its own item. */
export function findOverlaps(
  steps: readonly PlannedStep[],
  windowMs = OVERLAP_WINDOW_MS,
): OverlapPair[] {
  const sorted = [...steps].sort((x, y) => x.startAt - y.startAt);
  const pairs: OverlapPair[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const a = sorted[i] as PlannedStep;
    for (let j = i + 1; j < sorted.length; j += 1) {
      const b = sorted[j] as PlannedStep;
      if (b.startAt - a.startAt > windowMs) break;
      // Two bake-wide steps (null items) are both "Oven": one oven, one event.
      if (a.itemId === b.itemId) continue;
      if (sameSlot(a, b)) continue;
      pairs.push({ a: a.key, b: b.key });
    }
  }
  return pairs;
}

/** For each step key, the other step it clashes with (the earliest one), to label its row. */
export function overlapPartners(pairs: readonly OverlapPair[]): Map<string, string> {
  const partners = new Map<string, string>();
  for (const { a, b } of pairs) {
    if (!partners.has(a)) partners.set(a, b);
    if (!partners.has(b)) partners.set(b, a);
  }
  return partners;
}
