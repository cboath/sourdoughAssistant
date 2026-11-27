/**
 * Hand-off from the pantry editor back to the ingredient flow (`?returnTo=ingredient`). The editor
 * publishes the new item's id; the recipe editor or ingredient editor that asked for it consumes it.
 * In memory only, never a route param, so nothing is written because of a URL.
 */
import { create } from 'zustand';

export type PickRequest = 'add' | 'replace' | 'levainFlour';

interface PickedItemState {
  request: PickRequest | null;
  itemId: string | null;
  /** Called before opening the pantry editor. */
  expect(request: PickRequest): void;
  publish(itemId: string): void;
  /** Returns and clears the item for the matching request, or null. */
  consume(request: PickRequest): string | null;
  clear(): void;
}

export const usePickedItem = create<PickedItemState>()((set, get) => ({
  request: null,
  itemId: null,
  expect: (request) => set({ request, itemId: null }),
  publish: (itemId) => set((s) => (s.request ? { itemId } : s)),
  consume(request) {
    const { request: pending, itemId } = get();
    if (pending !== request || !itemId) return null;
    set({ request: null, itemId: null });
    return itemId;
  },
  clear: () => set({ request: null, itemId: null }),
}));
