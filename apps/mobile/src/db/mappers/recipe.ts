import type {
  IngredientRole,
  Recipe,
  RecipeIngredient,
  RecipeStep,
  StepAnchor,
  StepInput,
  StepKind,
  Unit,
} from '../types';
import { asBool, bit, toJson, type FieldMap } from '../sql';

export interface RecipeRow {
  id: string;
  name: string;
  notes: string;
  yield_loaves: number;
  dough_weight_g: number | null;
  tags_json: string;
  favorite: number;
  seed_key: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export const RECIPE_FIELDS: FieldMap = {
  name: 'name',
  notes: 'notes',
  yieldLoaves: 'yield_loaves',
  doughWeightG: 'dough_weight_g',
  tags: { col: 'tags_json', enc: (v) => toJson(v) },
  favorite: 'favorite',
  seedKey: 'seed_key',
};

export function toRecipe(row: RecipeRow): Recipe {
  return {
    id: row.id,
    name: row.name,
    notes: row.notes,
    yieldLoaves: row.yield_loaves,
    doughWeightG: row.dough_weight_g,
    tags: JSON.parse(row.tags_json) as string[],
    favorite: asBool(row.favorite),
    seedKey: row.seed_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export interface IngredientRow {
  id: string;
  recipe_id: string;
  pantry_item_id: string | null;
  position: number;
  name: string;
  role: IngredientRole;
  amount_g: number;
  entry_amount: number | null;
  entry_unit: Unit | null;
  levain_hydration_pct: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export const INGREDIENT_FIELDS: FieldMap = {
  pantryItemId: 'pantry_item_id',
  position: 'position',
  name: 'name',
  role: 'role',
  amountG: 'amount_g',
  entryAmount: 'entry_amount',
  entryUnit: 'entry_unit',
  levainHydrationPct: 'levain_hydration_pct',
};

export function toIngredient(row: IngredientRow): RecipeIngredient {
  return {
    id: row.id,
    recipeId: row.recipe_id,
    pantryItemId: row.pantry_item_id,
    position: row.position,
    name: row.name,
    role: row.role,
    amountG: row.amount_g,
    entryAmount: row.entry_amount,
    entryUnit: row.entry_unit,
    levainHydrationPct: row.levain_hydration_pct,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export interface StepRow {
  id: string;
  recipe_id: string;
  position: number;
  name: string;
  kind: StepKind;
  duration_min: number;
  min_min: number;
  max_min: number;
  temp_sensitive: number;
  anchor_type: 'sequential' | 'alongside';
  anchor_step_id: string | null;
  anchor_align: 'endsAtStart' | 'startsAtStart' | 'endsAtEnd' | null;
  anchor_offset_min: number;
  fold_count: number | null;
  fold_interval_min: number | null;
  notify: number;
  notes: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export function toStep(row: StepRow): RecipeStep {
  const anchor: StepAnchor =
    row.anchor_type === 'alongside' && row.anchor_step_id !== null && row.anchor_align !== null
      ? {
          type: 'alongside',
          stepId: row.anchor_step_id,
          align: row.anchor_align,
          offsetMin: row.anchor_offset_min,
        }
      : { type: 'sequential' };
  return {
    id: row.id,
    recipeId: row.recipe_id,
    position: row.position,
    name: row.name,
    kind: row.kind,
    durationMin: row.duration_min,
    minMin: row.min_min,
    maxMin: row.max_min,
    tempSensitive: asBool(row.temp_sensitive),
    anchor,
    folds:
      row.fold_count !== null && row.fold_interval_min !== null
        ? { count: row.fold_count, intervalMin: row.fold_interval_min }
        : null,
    notify: asBool(row.notify),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

/** Writable step columns (everything except id, recipe_id and sync fields). */
export function stepToColumns(
  step: StepInput,
  position: number,
): Record<string, string | number | null> {
  const alongside = step.anchor.type === 'alongside' ? step.anchor : null;
  return {
    position,
    name: step.name,
    kind: step.kind,
    duration_min: step.durationMin,
    min_min: step.minMin,
    max_min: step.maxMin,
    temp_sensitive: bit(step.tempSensitive),
    anchor_type: step.anchor.type,
    anchor_step_id: alongside ? alongside.stepId : null,
    anchor_align: alongside ? alongside.align : null,
    anchor_offset_min: alongside?.offsetMin ?? 0,
    fold_count: step.folds ? step.folds.count : null,
    fold_interval_min: step.folds ? step.folds.intervalMin : null,
    notify: bit(step.notify),
    notes: step.notes ?? '',
  };
}
