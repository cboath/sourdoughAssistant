/** Recipe writes. Every method invalidates `recipes.all` through `onChange`. */
import type { Repositories } from '../../../db/repositories';
import type { RecipeAggregate } from '../../../db/types';
import { draftToInput, type RecipeDraft } from '../draft';

export interface RecipeService {
  create(draft: RecipeDraft): Promise<RecipeAggregate>;
  /** Rejects with a `RepositoryError('notFound')` when the recipe was deleted meanwhile. */
  update(id: string, draft: RecipeDraft): Promise<RecipeAggregate>;
  remove(id: string): Promise<boolean>;
  /** Undo of `remove`. */
  restore(id: string): Promise<boolean>;
  setFavorite(id: string, favorite: boolean): Promise<void>;
}

export function createRecipeService(
  repos: Repositories,
  onChange: () => void | Promise<void>,
): RecipeService {
  const done = async <T>(value: T): Promise<T> => {
    await onChange();
    return value;
  };
  return {
    async create(draft) {
      return done(await repos.recipes.create(draftToInput(draft)));
    },
    async update(id, draft) {
      return done(await repos.recipes.update(id, draftToInput(draft)));
    },
    async remove(id) {
      return done(await repos.recipes.softDelete(id));
    },
    async restore(id) {
      return done(await repos.recipes.restore(id));
    },
    async setFavorite(id, favorite) {
      await repos.recipes.update(id, { recipe: { favorite } });
      await onChange();
    },
  };
}
