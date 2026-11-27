/**
 * `useScheduleDraft` (screens-bake.md 3.1, ADR 0002): the ephemeral state of one planning session.
 * It is owned by `app/bake/schedule/_layout.tsx` (reset when the modal closes) and is never
 * persisted. Route params only prefill it; nothing is written until "Schedule bake".
 */
import { randomUUID } from 'expo-crypto';
import type { LocalDateTime } from '@sourdough/core';
import { create } from 'zustand';
import { MAX_RECIPES_PER_BAKE } from './labels';

export interface DraftItem {
  /** Becomes the `bake_item` id, so the plan's step keys are already final. */
  tempId: string;
  recipeId: string;
  loaves: number;
  /** Slider values by step id, in minutes. */
  overrides: Record<string, number>;
}

export interface Selection {
  recipeId: string;
  loaves: number;
}

export const MAX_LOAVES = 50;
export const MAX_OVEN_CAPACITY = 12;

interface DraftData {
  items: DraftItem[];
  mode: 'backward' | 'forward';
  /** What the user picked, or the smart default; null until defaulted. */
  readyLocal: LocalDateTime | null;
  /** `null` means "the Settings default" (changing it here never changes Settings). */
  ovenCapacity: number | null;
  /** Celsius. `null` is "Not set" (open-questions B6). */
  kitchenTempC: number | null;
  /** Any user change; drives the discard confirm. */
  touched: boolean;
}

export interface ScheduleDraftState extends DraftData {
  /** Replaces the selection, keeping sliders for recipes that stay (screens-bake.md 2.4). */
  setSelection(selection: readonly Selection[]): void;
  addItem(selection: Selection): void;
  /** Returns the removed item and its index for an Undo. */
  removeItem(tempId: string): { item: DraftItem; index: number } | null;
  restoreItem(item: DraftItem, index: number): void;
  moveItem(tempId: string, direction: -1 | 1): void;
  setLoaves(tempId: string, loaves: number): void;
  /** `minutes: null` clears the slider value. */
  setOverride(tempId: string, stepId: string, minutes: number | null): void;
  replaceOverrides(tempId: string, overrides: Record<string, number>): void;
  setMode(mode: 'backward' | 'forward'): void;
  /** A picked time: counts as a user change. */
  setReadyLocal(ready: LocalDateTime): void;
  /** The computed default: not a user change. */
  setDefaultReady(ready: LocalDateTime): void;
  setOvenCapacity(capacity: number): void;
  setKitchenTemp(tempC: number | null): void;
  /** After a successful save: closing the modal is no longer a discard. */
  markSaved(): void;
  reset(): void;
}

const initial = (): DraftData => ({
  items: [],
  mode: 'backward',
  readyLocal: null,
  ovenCapacity: null,
  kitchenTempC: null,
  touched: false,
});

const clampLoaves = (n: number) => Math.min(MAX_LOAVES, Math.max(1, Math.round(n)));

export const useScheduleDraft = create<ScheduleDraftState>()((set) => ({
  ...initial(),

  setSelection(selection) {
    set((state) => {
      const picked = selection.slice(0, MAX_RECIPES_PER_BAKE);
      const used = new Set<string>();
      const items = picked.map(({ recipeId, loaves }) => {
        const existing = state.items.find((i) => i.recipeId === recipeId && !used.has(i.tempId));
        if (existing) used.add(existing.tempId);
        return {
          tempId: existing?.tempId ?? randomUUID(),
          recipeId,
          loaves: clampLoaves(loaves),
          overrides: existing?.overrides ?? {},
        };
      });
      return { items };
    });
  },

  addItem({ recipeId, loaves }) {
    set((state) =>
      state.items.length >= MAX_RECIPES_PER_BAKE
        ? state
        : {
            items: [
              ...state.items,
              { tempId: randomUUID(), recipeId, loaves: clampLoaves(loaves), overrides: {} },
            ],
            touched: true,
          },
    );
  },

  removeItem(tempId) {
    let removed: { item: DraftItem; index: number } | null = null;
    set((state) => {
      const index = state.items.findIndex((i) => i.tempId === tempId);
      if (index < 0) return state;
      removed = { item: state.items[index] as DraftItem, index };
      return { items: state.items.filter((i) => i.tempId !== tempId), touched: true };
    });
    return removed;
  },

  restoreItem(item, index) {
    set((state) => {
      if (state.items.some((i) => i.tempId === item.tempId)) return state;
      if (state.items.length >= MAX_RECIPES_PER_BAKE) return state;
      const items = [...state.items];
      items.splice(Math.min(index, items.length), 0, item);
      return { items, touched: true };
    });
  },

  moveItem(tempId, direction) {
    set((state) => {
      const from = state.items.findIndex((i) => i.tempId === tempId);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= state.items.length) return state;
      const items = [...state.items];
      const [moved] = items.splice(from, 1);
      items.splice(to, 0, moved as DraftItem);
      return { items, touched: true };
    });
  },

  setLoaves(tempId, loaves) {
    set((state) => ({
      items: state.items.map((i) =>
        i.tempId === tempId ? { ...i, loaves: clampLoaves(loaves) } : i,
      ),
      touched: true,
    }));
  },

  setOverride(tempId, stepId, minutes) {
    set((state) => ({
      items: state.items.map((i) => {
        if (i.tempId !== tempId) return i;
        const overrides = { ...i.overrides };
        if (minutes === null) delete overrides[stepId];
        else overrides[stepId] = Math.round(minutes);
        return { ...i, overrides };
      }),
      touched: true,
    }));
  },

  replaceOverrides(tempId, overrides) {
    set((state) => ({
      items: state.items.map((i) =>
        i.tempId === tempId ? { ...i, overrides: { ...overrides } } : i,
      ),
      touched: true,
    }));
  },

  setMode(mode) {
    set({ mode, touched: true });
  },
  setReadyLocal(readyLocal) {
    set({ readyLocal, touched: true });
  },
  setDefaultReady(readyLocal) {
    set({ readyLocal });
  },
  setOvenCapacity(capacity) {
    set({
      ovenCapacity: Math.min(MAX_OVEN_CAPACITY, Math.max(1, Math.round(capacity))),
      touched: true,
    });
  },
  setKitchenTemp(kitchenTempC) {
    set({ kitchenTempC, touched: true });
  },
  markSaved() {
    set({ touched: false });
  },
  reset() {
    set(initial());
  },
}));
