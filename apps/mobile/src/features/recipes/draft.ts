/**
 * The recipe editor's draft and its pure operations (screens-recipes.md section 6). No React, no
 * storage: the store in `store.ts` holds one, `recipeService` writes it.
 */
import { validateSteps, type IngredientLine, type StepValidationError } from '@sourdough/core';
import { SEED_CATALOG } from '../../db/seed';
import type {
  IngredientRole,
  NewRecipeAggregate,
  RecipeAggregate,
  StepTemplate,
  Unit,
} from '../../db/types';
import { t } from '../../lib/i18n';
import { LIMITS, cleanName, cleanNotes } from '../../lib/sanitize';

export type IdFactory = () => string;

export interface DraftIngredient {
  id: string;
  pantryItemId: string | null;
  name: string;
  role: IngredientRole;
  amountG: number;
  entryAmount: number | null;
  entryUnit: Unit | null;
  levainHydrationPct: number | null;
}

export interface DraftStep extends StepTemplate {
  notes: string;
}

export interface DraftRecipe {
  name: string;
  yieldLoaves: number;
  doughWeightG: number | null;
  tags: string[];
  favorite: boolean;
  notes: string;
}

export interface RecipeDraft {
  recipe: DraftRecipe;
  ingredients: DraftIngredient[];
  steps: DraftStep[];
}

const DEFAULT_RECIPE: DraftRecipe = {
  name: '',
  yieldLoaves: 1,
  doughWeightG: null,
  tags: [],
  favorite: false,
  notes: '',
};

/** The default process (PRD section 5) with fresh ids, shared by every new recipe. */
/** A copy without `id` (seed rows carry fixed ids that must never be reused). */
export function withoutId<T extends { id: string }>(row: T): Omit<T, 'id'> {
  const copy: Partial<T> = { ...row };
  delete copy.id;
  return copy as Omit<T, 'id'>;
}

export function defaultSteps(newId: IdFactory): DraftStep[] {
  const process = SEED_CATALOG.recipes.find((r) => r.seedKey === 'recipe:country-loaf');
  if (!process) return [];
  const idByKey = new Map(process.steps.map((s) => [s.key, newId()]));
  return process.steps.map(({ key, alongsideOf, ...seedStep }) => ({
    ...withoutId(seedStep),
    id: idByKey.get(key) as string,
    notes: '',
    anchor: alongsideOf
      ? {
          type: 'alongside' as const,
          stepId: idByKey.get(alongsideOf) as string,
          align: 'endsAtStart' as const,
          offsetMin: 0,
        }
      : { type: 'sequential' as const },
  }));
}

export function blankDraft(newId: IdFactory): RecipeDraft {
  return { recipe: { ...DEFAULT_RECIPE }, ingredients: [], steps: defaultSteps(newId) };
}

export function draftFromAggregate(aggregate: RecipeAggregate): RecipeDraft {
  const { recipe } = aggregate;
  return {
    recipe: {
      name: recipe.name,
      yieldLoaves: recipe.yieldLoaves,
      doughWeightG: recipe.doughWeightG,
      tags: [...recipe.tags],
      favorite: recipe.favorite,
      notes: recipe.notes,
    },
    ingredients: aggregate.ingredients.map((i) => ({
      id: i.id,
      pantryItemId: i.pantryItemId,
      name: i.name,
      role: i.role,
      amountG: i.amountG,
      entryAmount: i.entryAmount,
      entryUnit: i.entryUnit,
      levainHydrationPct: i.levainHydrationPct,
    })),
    steps: aggregate.steps.map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
      durationMin: s.durationMin,
      minMin: s.minMin,
      maxMin: s.maxMin,
      tempSensitive: s.tempSensitive,
      anchor: s.anchor,
      folds: s.folds,
      notify: s.notify,
      notes: s.notes,
    })),
  };
}

/** A copy with new ids, anchors remapped, "(copy)" in the name and `favorite` off. */
export function duplicateDraft(aggregate: RecipeAggregate, newId: IdFactory): RecipeDraft {
  const source = draftFromAggregate(aggregate);
  const stepIds = new Map(source.steps.map((s) => [s.id, newId()]));
  return {
    recipe: {
      ...source.recipe,
      name: cleanName(t('edit.copyName', { name: source.recipe.name }), LIMITS.recipeName),
      favorite: false,
    },
    ingredients: source.ingredients.map((i) => ({ ...i, id: newId() })),
    steps: source.steps.map((s) => ({
      ...s,
      id: stepIds.get(s.id) as string,
      anchor:
        s.anchor.type === 'alongside'
          ? { ...s.anchor, stepId: stepIds.get(s.anchor.stepId) ?? s.anchor.stepId }
          : s.anchor,
    })),
  };
}

/**
 * The same draft with fresh ids for every line and step (anchors remapped). Used when a recipe
 * is saved as a new row, because the old rows may still exist as tombstones with those ids.
 */
export function withNewIds(draft: RecipeDraft, newId: IdFactory): RecipeDraft {
  const stepIds = new Map(draft.steps.map((s) => [s.id, newId()]));
  return {
    recipe: { ...draft.recipe },
    ingredients: draft.ingredients.map((i) => ({ ...i, id: newId() })),
    steps: draft.steps.map((s) => ({
      ...s,
      id: stepIds.get(s.id) as string,
      anchor:
        s.anchor.type === 'alongside'
          ? { ...s.anchor, stepId: stepIds.get(s.anchor.stepId) ?? s.anchor.stepId }
          : s.anchor,
    })),
  };
}

/** Input for `recipes.create` / `recipes.update`, with names and notes cleaned and capped. */
export function draftToInput(draft: RecipeDraft): NewRecipeAggregate {
  const { recipe } = draft;
  return {
    recipe: {
      name: cleanName(recipe.name, LIMITS.recipeName),
      notes: cleanNotes(recipe.notes, LIMITS.recipeNotes),
      yieldLoaves: recipe.yieldLoaves,
      doughWeightG: recipe.doughWeightG,
      tags: recipe.tags.map((tag) => cleanName(tag, LIMITS.tagLength)).filter(Boolean),
      favorite: recipe.favorite,
    },
    ingredients: draft.ingredients.map((i) => ({
      id: i.id,
      pantryItemId: i.pantryItemId,
      name: cleanName(i.name, LIMITS.lineName),
      role: i.role,
      amountG: i.amountG,
      entryAmount: i.entryAmount,
      entryUnit: i.entryUnit,
      levainHydrationPct: i.role === 'levain' ? i.levainHydrationPct : null,
    })),
    steps: draft.steps.map((s) => ({
      ...s,
      name: cleanName(s.name, LIMITS.stepName),
      notes: cleanNotes(s.notes, LIMITS.stepNotes),
    })),
  };
}

export function draftToLines(ingredients: readonly DraftIngredient[]): IngredientLine[] {
  return ingredients.map((i) => ({
    id: i.id,
    name: i.name,
    role: i.role,
    amountG: i.amountG,
    levainHydrationPct: i.levainHydrationPct,
  }));
}

// List operations ------------------------------------------------------------------------

/** Moves the item with `id` by `delta` positions. Returns the same array when it cannot move. */
export function moveById<T extends { id: string }>(
  list: readonly T[],
  id: string,
  delta: -1 | 1,
): T[] {
  const from = list.findIndex((x) => x.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}

export function insertAt<T>(list: readonly T[], item: T, index: number): T[] {
  const next = [...list];
  next.splice(Math.max(0, Math.min(index, next.length)), 0, item);
  return next;
}

export function upsertById<T extends { id: string }>(list: readonly T[], item: T): T[] {
  const index = list.findIndex((x) => x.id === item.id);
  if (index < 0) return [...list, item];
  const next = [...list];
  next[index] = item;
  return next;
}

/** Steps whose anchor points at `stepId`. */
export function dependentsOf(steps: readonly DraftStep[], stepId: string): DraftStep[] {
  return steps.filter((s) => s.anchor.type === 'alongside' && s.anchor.stepId === stepId);
}

// Tags -----------------------------------------------------------------------------------

export type TagResult = { ok: true; tags: string[] } | { ok: false; error: string };

/** Trims, de-duplicates case-insensitively, caps at 20 tags of 40 characters. */
export function addTag(tags: readonly string[], text: string): TagResult {
  const cleaned = cleanName(text, 1000);
  if (cleaned === '') return { ok: true, tags: [...tags] };
  if (Array.from(cleaned).length > LIMITS.tagLength) return { ok: false, error: t('val.tag.long') };
  if (tags.some((x) => x.toLocaleLowerCase() === cleaned.toLocaleLowerCase())) {
    return { ok: false, error: t('val.tag.dup') };
  }
  if (tags.length >= LIMITS.tags) return { ok: false, error: t('val.tag.max') };
  return { ok: true, tags: [...tags, cleaned] };
}

// Validation -----------------------------------------------------------------------------

export type IssueTarget = 'name' | 'doughWeight' | 'ingredients' | 'steps' | { stepId: string };
export interface DraftIssue {
  target: IssueTarget;
  message: string;
}

export interface DraftValidation {
  issues: DraftIssue[];
  name?: string;
  doughWeight?: string;
  ingredients?: string;
  steps?: string;
  /** Messages keyed by step id. */
  stepErrors: Record<string, string>;
  /** True when the steps pass core `validateSteps`. */
  stepsValid: boolean;
}

function stepMessage(error: StepValidationError): {
  stepId?: string;
  stepIds?: string[];
  message: string;
} {
  switch (error.code) {
    case 'rangeInvalid':
      return { stepId: error.stepId, message: t('val.step.range') };
    case 'foldDurationMismatch':
      return { stepId: error.stepId, message: t('val.step.folds') };
    case 'anchorMissing':
      return { stepId: error.stepId, message: t('val.step.anchor') };
    case 'alongsideChain':
      return { stepId: error.stepId, message: t('val.step.chain') };
    case 'ovenPhaseNotContiguous':
      return { stepIds: error.stepIds, message: t('val.step.ovenPhase') };
    case 'noSequentialSteps':
      return { message: t('val.step.noSequential') };
    case 'emptyRecipe':
      return { message: t('val.recipe.steps') };
    default:
      // noOvenPhase and overrideOutOfRange belong to scheduling, not to this editor.
      return { message: '' };
  }
}

export function validateDraft(draft: RecipeDraft): DraftValidation {
  const out: DraftValidation = { issues: [], stepErrors: {}, stepsValid: true };
  const name = cleanName(draft.recipe.name, 1000);
  if (name === '') {
    out.name = t('val.recipe.name');
    out.issues.push({ target: 'name', message: out.name });
  } else if (Array.from(name).length > LIMITS.recipeName) {
    out.name = t('val.recipe.nameLong');
    out.issues.push({ target: 'name', message: out.name });
  }
  const dw = draft.recipe.doughWeightG;
  if (dw !== null && (!Number.isFinite(dw) || dw < 50 || dw > 20_000)) {
    out.doughWeight = t('val.recipe.doughWeight');
    out.issues.push({ target: 'doughWeight', message: out.doughWeight });
  }
  if (!draft.ingredients.some((i) => i.role === 'flour')) {
    out.ingredients = t('val.recipe.flour');
    out.issues.push({ target: 'ingredients', message: out.ingredients });
  }
  const steps = validateSteps(draft.steps);
  if (!steps.ok) {
    out.stepsValid = false;
    for (const error of steps.error) {
      const m = stepMessage(error);
      if (!m.message) continue;
      const ids = m.stepIds ?? (m.stepId ? [m.stepId] : []);
      if (ids.length === 0) {
        out.steps ??= m.message;
        out.issues.push({ target: 'steps', message: m.message });
      }
      for (const stepId of ids) {
        out.stepErrors[stepId] ??= m.message;
        out.issues.push({ target: { stepId }, message: m.message });
      }
    }
  }
  return out;
}
