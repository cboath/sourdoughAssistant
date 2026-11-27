/**
 * `useRecipeDraft` (architecture section 5): the editor's working copy, shared by the recipe,
 * ingredient and step screens. Created and reset by `recipe-editor/_layout.tsx`.
 */
import { create } from 'zustand';
import {
  dependentsOf,
  insertAt,
  moveById,
  upsertById,
  type DraftIngredient,
  type DraftRecipe,
  type DraftStep,
  type RecipeDraft,
} from './draft';

export interface RemovedItem<T> {
  item: T;
  index: number;
}

interface RecipeDraftState {
  /** What the draft was started from ("new", "edit:<id>", "copy:<id>"), so a re-render never re-inits. */
  sourceKey: string | null;
  /** The recipe being edited; null for a new one. */
  recipeId: string | null;
  draft: RecipeDraft | null;
  /** JSON of the draft when it was loaded; the draft is dirty when it differs. */
  baseline: string | null;

  init(sourceKey: string, recipeId: string | null, draft: RecipeDraft): void;
  reset(): void;
  markSaved(): void;
  setRecipe(patch: Partial<DraftRecipe>): void;

  upsertIngredient(item: DraftIngredient): void;
  removeIngredient(id: string): RemovedItem<DraftIngredient> | null;
  insertIngredient(item: DraftIngredient, index: number): void;
  moveIngredient(id: string, delta: -1 | 1): void;

  upsertStep(item: DraftStep): void;
  removeStep(id: string): (RemovedItem<DraftStep> & { dependents: DraftStep[] }) | null;
  insertStep(item: DraftStep, index: number): void;
  moveStep(id: string, delta: -1 | 1): void;
}

export const useRecipeDraft = create<RecipeDraftState>()((set, get) => {
  const edit = (change: (draft: RecipeDraft) => RecipeDraft) =>
    set((s) => (s.draft ? { draft: change(s.draft) } : s));
  return {
    sourceKey: null,
    recipeId: null,
    draft: null,
    baseline: null,

    init: (sourceKey, recipeId, draft) =>
      set({ sourceKey, recipeId, draft, baseline: JSON.stringify(draft) }),
    reset: () => set({ sourceKey: null, recipeId: null, draft: null, baseline: null }),
    markSaved: () => set((s) => ({ baseline: JSON.stringify(s.draft) })),
    setRecipe: (patch) => edit((d) => ({ ...d, recipe: { ...d.recipe, ...patch } })),

    upsertIngredient: (item) =>
      edit((d) => ({ ...d, ingredients: upsertById(d.ingredients, item) })),
    removeIngredient(id) {
      const draft = get().draft;
      const index = draft?.ingredients.findIndex((i) => i.id === id) ?? -1;
      if (!draft || index < 0) return null;
      const item = draft.ingredients[index] as DraftIngredient;
      edit((d) => ({ ...d, ingredients: d.ingredients.filter((i) => i.id !== id) }));
      return { item, index };
    },
    insertIngredient: (item, index) =>
      edit((d) => ({ ...d, ingredients: insertAt(d.ingredients, item, index) })),
    moveIngredient: (id, delta) =>
      edit((d) => ({ ...d, ingredients: moveById(d.ingredients, id, delta) })),

    upsertStep: (item) => edit((d) => ({ ...d, steps: upsertById(d.steps, item) })),
    removeStep(id) {
      const draft = get().draft;
      const index = draft?.steps.findIndex((s) => s.id === id) ?? -1;
      if (!draft || index < 0) return null;
      const item = draft.steps[index] as DraftStep;
      const dependents = dependentsOf(draft.steps, id);
      edit((d) => ({ ...d, steps: d.steps.filter((s) => s.id !== id) }));
      return { item, index, dependents };
    },
    insertStep: (item, index) => edit((d) => ({ ...d, steps: insertAt(d.steps, item, index) })),
    moveStep: (id, delta) => edit((d) => ({ ...d, steps: moveById(d.steps, id, delta) })),
  };
});

export const selectIsDirty = (s: { draft: RecipeDraft | null; baseline: string | null }): boolean =>
  s.draft !== null && JSON.stringify(s.draft) !== s.baseline;
