import { SEED_CATALOG, seedDatabase } from '../../../db/seed';
import { createTestDb } from '../../../db/test-utils';
import { blankDraft, draftToInput, type RecipeDraft } from '../draft';
import { createRecipeService } from '../services/recipeService';
import { addStarterRecipes } from '../services/starterRecipes';

let n = 0;
const newId = () => `00000000-0000-4000-9000-${String(++n).padStart(12, '0')}`;

const draft = (name: string): RecipeDraft => {
  const d = blankDraft(newId);
  return {
    ...d,
    recipe: { ...d.recipe, name },
    ingredients: [
      {
        id: newId(),
        pantryItemId: null,
        name: 'Flour',
        role: 'flour',
        amountG: 500,
        entryAmount: null,
        entryUnit: null,
        levainHydrationPct: null,
      },
    ],
  };
};

describe('recipeService', () => {
  it('creates, edits, favorites, deletes and restores', async () => {
    const { repos, clock } = await createTestDb();
    const onChange = jest.fn();
    const service = createRecipeService(repos, onChange);

    const created = await service.create(draft('Rye'));
    expect(created.steps).toHaveLength(10);
    const id = created.recipe.id;

    clock.advance(1000);
    const edited = draft('Rye 2');
    await service.update(id, {
      ...edited,
      ingredients: edited.ingredients,
      steps: created.steps.map((s) => ({ ...s, notes: s.notes })),
    });
    expect((await repos.recipes.get(id))?.recipe.name).toBe('Rye 2');

    await service.setFavorite(id, true);
    expect((await repos.recipes.get(id))?.recipe.favorite).toBe(true);

    clock.advance(1000);
    expect(await service.remove(id)).toBe(true);
    expect(await repos.recipes.get(id)).toBeNull();
    expect(await service.restore(id)).toBe(true);
    const back = await repos.recipes.get(id);
    expect(back?.steps).toHaveLength(10);
    expect(back?.ingredients).toHaveLength(1);
    expect(onChange).toHaveBeenCalledTimes(5);
  });

  it('rejects an update after the recipe was deleted elsewhere', async () => {
    const { repos } = await createTestDb();
    const service = createRecipeService(repos, jest.fn());
    const created = await service.create(draft('Gone'));
    await repos.recipes.softDelete(created.recipe.id);
    await expect(service.update(created.recipe.id, draft('Gone'))).rejects.toMatchObject({
      code: 'notFound',
    });
  });

  it('input from a draft keeps ids so unchanged rows are not rewritten', () => {
    const d = draft('Same');
    expect(draftToInput(d).ingredients[0]?.id).toBe(d.ingredients[0]?.id);
  });
});

describe('addStarterRecipes', () => {
  it('inserts fresh copies: new ids, no seed key, shared pantry items reused', async () => {
    const db = await createTestDb();
    await seedDatabase(db.repos);
    // The user deleted every recipe; the pantry stays.
    for (const r of await db.repos.recipes.list()) await db.repos.recipes.softDelete(r.id);
    const pantryBefore = (await db.repos.pantry.list()).length;

    const result = await addStarterRecipes(db.repos, newId);
    expect(result.recipes).toBe(SEED_CATALOG.recipes.length);
    const recipes = await db.repos.recipes.list();
    expect(recipes).toHaveLength(SEED_CATALOG.recipes.length);
    const seedIds = new Set(SEED_CATALOG.recipes.map((r) => r.id));
    expect(recipes.every((r) => r.seedKey === null && !seedIds.has(r.id))).toBe(true);

    const country = await db.repos.recipes.get(recipes.find((r) => r.name === 'Country loaf')!.id);
    const seedLineIds = new Set(
      SEED_CATALOG.recipes.flatMap((r) => r.ingredients.map((i) => i.id)),
    );
    const seedStepIds = new Set(SEED_CATALOG.recipes.flatMap((r) => r.steps.map((s) => s.id)));
    expect(country?.ingredients.every((i) => !seedLineIds.has(i.id) && i.pantryItemId)).toBe(true);
    expect(country?.steps.every((s) => !seedStepIds.has(s.id))).toBe(true);
    // Matched by seed key, so no duplicate pantry items.
    expect((await db.repos.pantry.list()).length).toBe(pantryBefore);
  });

  it('matches an existing item by name and creates missing ones without a seed key', async () => {
    const { repos } = await createTestDb();
    await repos.pantry.create({
      name: 'bread FLOUR',
      category: 'flour',
      packagePriceCents: 100,
      packageSize: 1,
      packageUnit: 'kg',
    });
    await addStarterRecipes(repos, newId);
    const items = await repos.pantry.list();
    expect(items.filter((i) => i.name.toLowerCase() === 'bread flour')).toHaveLength(1);
    expect(items.find((i) => i.name === 'Salt')?.seedKey).toBeNull();
  });
});
