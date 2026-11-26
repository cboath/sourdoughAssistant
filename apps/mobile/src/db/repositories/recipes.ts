import type { SqlExecutor } from '../adapter';
import type { CreateOptions } from '../deps';
import { RepositoryError } from '../errors';
import {
  INGREDIENT_FIELDS,
  RECIPE_FIELDS,
  stepToColumns,
  toIngredient,
  toRecipe,
  toStep,
  type IngredientRow,
  type RecipeRow,
  type StepRow,
} from '../mappers/recipe';
import {
  insertRow,
  softDeleteWhere,
  toColumns,
  updateRow,
  writeChildren,
  type ChildWrite,
} from '../sql';
import type {
  IngredientInput,
  NewRecipeAggregate,
  Recipe,
  RecipeAggregate,
  RecipeAggregatePatch,
  ReadOptions,
  StepInput,
} from '../types';
import { getRowById, requireRow, type RepoContext } from './context';

export function createRecipeRepository({ q, atomic, clock, ids }: RepoContext) {
  const ingredientWrites = (inputs: readonly IngredientInput[]): ChildWrite[] =>
    inputs.map((input, index) => ({
      id: input.id ?? ids.newId(),
      columns: toColumns({ ...input, position: index }, INGREDIENT_FIELDS),
    }));

  /**
   * Alongside steps are written after the steps they anchor to, because `step.anchor_step_id` is
   * a foreign key. Positions follow the input order regardless.
   */
  const stepWrites = (inputs: readonly StepInput[]): ChildWrite[] => {
    const withIds = inputs.map((input, index) => ({
      input,
      index,
      id: input.id ?? ids.newId(),
    }));
    const stepIds = new Set(withIds.map((s) => s.id));
    for (const { input, id } of withIds) {
      if (input.anchor.type === 'alongside') {
        if (input.anchor.stepId === id || !stepIds.has(input.anchor.stepId)) {
          throw new RepositoryError(
            'invalid',
            `Step "${input.name}" is anchored to a step that is not in this recipe.`,
          );
        }
      }
    }
    const ordered = [
      ...withIds.filter((s) => s.input.anchor.type === 'sequential'),
      ...withIds.filter((s) => s.input.anchor.type === 'alongside'),
    ];
    return ordered.map(({ input, index, id }) => ({
      id,
      columns: stepToColumns(input, index),
    }));
  };

  const readAggregate = async (
    id: string,
    options?: ReadOptions,
  ): Promise<RecipeAggregate | null> => {
    const row = await getRowById<RecipeRow>(q, 'recipe', id, options);
    if (!row) return null;
    const live = options?.includeDeleted ? '' : ' AND deleted_at IS NULL';
    const [ingredients, steps] = await Promise.all([
      q.all<IngredientRow>(
        `SELECT * FROM recipe_ingredient WHERE recipe_id = $id${live} ORDER BY position, id`,
        { $id: id },
      ),
      q.all<StepRow>(`SELECT * FROM step WHERE recipe_id = $id${live} ORDER BY position, id`, {
        $id: id,
      }),
    ]);
    return {
      recipe: toRecipe(row),
      ingredients: ingredients.map(toIngredient),
      steps: steps.map(toStep),
    };
  };

  const writeAll = async (
    tx: SqlExecutor,
    recipeId: string,
    ingredients: ChildWrite[] | undefined,
    steps: ChildWrite[] | undefined,
    now: string,
  ): Promise<void> => {
    if (ingredients) {
      await writeChildren(tx, 'recipe_ingredient', 'recipe_id', recipeId, ingredients, now);
    }
    if (steps) await writeChildren(tx, 'step', 'recipe_id', recipeId, steps, now);
  };

  return {
    /** The recipe with its live ingredients and steps, or null. */
    get: readAggregate,

    /** Recipe headers only: favorites first, then by name. */
    async list(): Promise<Recipe[]> {
      const rows = await q.all<RecipeRow>(
        'SELECT * FROM recipe WHERE deleted_at IS NULL ORDER BY favorite DESC, name COLLATE NOCASE, id',
      );
      return rows.map(toRecipe);
    },

    /** Includes tombstoned rows so a deleted seed is never recreated. */
    async findBySeedKey(seedKey: string): Promise<Recipe | null> {
      const row = await q.get<RecipeRow>('SELECT * FROM recipe WHERE seed_key = $k', {
        $k: seedKey,
      });
      return row ? toRecipe(row) : null;
    },

    /**
     * Creates the recipe, ingredients and steps in one transaction. Give a step an `id` when
     * another step's `alongside` anchor references it.
     */
    async create(input: NewRecipeAggregate, options?: CreateOptions): Promise<RecipeAggregate> {
      const id = options?.id ?? ids.newId();
      const now = options?.at ?? clock.nowIso();
      const ingredients = ingredientWrites(input.ingredients);
      const steps = stepWrites(input.steps);
      await atomic(async (tx) => {
        await insertRow(tx, 'recipe', {
          ...toColumns(input.recipe, RECIPE_FIELDS),
          id,
          created_at: now,
          updated_at: now,
        });
        await writeAll(tx, id, ingredients, steps, now);
      });
      return (await readAggregate(id)) as RecipeAggregate;
    },

    /**
     * Edits the recipe. `ingredients` and `steps`, when given, replace the whole list: rows with a
     * known id are updated (only if changed), new ones inserted, missing ones soft-deleted.
     */
    async update(id: string, patch: RecipeAggregatePatch): Promise<RecipeAggregate> {
      const now = clock.nowIso();
      const ingredients = patch.ingredients && ingredientWrites(patch.ingredients);
      const steps = patch.steps && stepWrites(patch.steps);
      await atomic(async (tx) => {
        await requireRow<RecipeRow>(tx, 'recipe', id, 'Recipe');
        await updateRow(tx, 'recipe', { id }, toColumns(patch.recipe ?? {}, RECIPE_FIELDS), now);
        await writeAll(tx, id, ingredients, steps, now);
      });
      return (await readAggregate(id)) as RecipeAggregate;
    },

    /** Tombstones the recipe and its ingredient and step rows in one transaction. */
    async softDelete(id: string): Promise<boolean> {
      const now = clock.nowIso();
      return atomic(async (tx) => {
        const changes = await updateRow(
          tx,
          'recipe',
          { id, deleted_at: null },
          { deleted_at: now },
          now,
        );
        if (changes === 0) return false;
        await softDeleteWhere(tx, 'recipe_ingredient', 'recipe_id', id, now);
        await softDeleteWhere(tx, 'step', 'recipe_id', id, now);
        return true;
      });
    },
  };
}
export type RecipeRepository = ReturnType<typeof createRecipeRepository>;
