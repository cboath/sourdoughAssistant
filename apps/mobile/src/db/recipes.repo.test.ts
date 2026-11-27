import { recipeInput, step } from './fixtures';
import { createTestDb } from './test-utils';

describe('recipe repository', () => {
  it('creates an aggregate and reloads it with stable ids and ordered children', async () => {
    const { repos } = await createTestDb();
    const created = await repos.recipes.create(recipeInput());
    expect(created.recipe).toMatchObject({
      name: 'Country loaf',
      yieldLoaves: 1,
      tags: ['Classic'],
      favorite: false,
      notes: '',
      deletedAt: null,
    });
    expect(created.ingredients.map((i) => [i.position, i.name, i.levainHydrationPct])).toEqual([
      [0, 'Bread flour', null],
      [1, 'Water', null],
      [2, 'Levain', 100],
    ]);
    expect(created.steps.map((s) => s.id)).toEqual(['bake', 'preheat']);
    expect(created.steps[1]?.anchor).toEqual({
      type: 'alongside',
      stepId: 'bake',
      align: 'endsAtStart',
      offsetMin: 0,
    });
    expect(created.steps[0]).toMatchObject({ anchor: { type: 'sequential' }, folds: null });
    expect(await repos.recipes.get(created.recipe.id)).toEqual(created);
  });

  it('stores fold steps and maps them to the core shape', async () => {
    const { repos } = await createTestDb();
    const r = await repos.recipes.create(
      recipeInput({
        steps: [
          step({
            name: 'Folds',
            kind: 'fold',
            durationMin: 120,
            minMin: 120,
            maxMin: 120,
            tempSensitive: false,
            folds: { count: 4, intervalMin: 30 },
          }),
        ],
      }),
    );
    expect(r.steps[0]?.folds).toEqual({ count: 4, intervalMin: 30 });
    await expect(
      repos.recipes.create(
        recipeInput({ steps: [step({ folds: { count: 4, intervalMin: 30 }, durationMin: 100 })] }),
      ),
    ).rejects.toThrow(/CHECK/);
  });

  it('edits: updatedAt changes, createdAt does not; unchanged children are not touched', async () => {
    const { repos, clock } = await createTestDb();
    const created = await repos.recipes.create(recipeInput());
    clock.advance(10_000);
    const [flour, water, levain] = created.ingredients;
    const edited = await repos.recipes.update(created.recipe.id, {
      recipe: { name: 'Sourdough', favorite: true, doughWeightG: 900 },
      ingredients: [
        { id: flour!.id, name: 'Bread flour', role: 'flour', amountG: 500 },
        { id: water!.id, name: 'Water', role: 'water', amountG: 380 },
        { id: levain!.id, name: 'Levain', role: 'levain', amountG: 100, levainHydrationPct: 100 },
      ],
    });
    expect(edited.recipe).toMatchObject({
      name: 'Sourdough',
      favorite: true,
      doughWeightG: 900,
      createdAt: created.recipe.createdAt,
      updatedAt: '2026-11-26T12:00:10.000Z',
    });
    const byId = new Map(edited.ingredients.map((i) => [i.id, i]));
    expect(byId.get(flour!.id)?.updatedAt).toBe(flour!.updatedAt); // unchanged
    expect(byId.get(water!.id)).toMatchObject({
      amountG: 380,
      createdAt: water!.createdAt,
      updatedAt: '2026-11-26T12:00:10.000Z',
    });
    expect(edited.steps).toEqual(created.steps); // steps not given: untouched
  });

  it('replacing children adds new rows and tombstones the missing ones', async () => {
    const { repos, db, clock } = await createTestDb();
    const created = await repos.recipes.create(recipeInput());
    clock.advance(1000);
    const [flour] = created.ingredients;
    const edited = await repos.recipes.update(created.recipe.id, {
      ingredients: [
        { name: 'Salt', role: 'salt', amountG: 10 },
        { id: flour!.id, name: 'Bread flour', role: 'flour', amountG: 500 },
      ],
      steps: [],
    });
    expect(edited.ingredients.map((i) => [i.position, i.name])).toEqual([
      [0, 'Salt'],
      [1, 'Bread flour'],
    ]);
    expect(edited.steps).toEqual([]);
    const rows = await db.all<{ deleted_at: string | null }>(
      'SELECT deleted_at FROM recipe_ingredient WHERE recipe_id = $r',
      { $r: created.recipe.id },
    );
    expect(rows).toHaveLength(4);
    expect(rows.filter((r) => r.deleted_at !== null)).toHaveLength(2);
    const steps = await db.get<{ n: number }>(
      'SELECT COUNT(*) AS n FROM step WHERE deleted_at IS NOT NULL',
    );
    expect(steps?.n).toBe(2);
  });

  it('a removed child can come back by id', async () => {
    const { repos } = await createTestDb();
    const created = await repos.recipes.create(recipeInput());
    const [flour] = created.ingredients;
    await repos.recipes.update(created.recipe.id, { ingredients: [] });
    const back = await repos.recipes.update(created.recipe.id, {
      ingredients: [{ id: flour!.id, name: 'Bread flour', role: 'flour', amountG: 500 }],
    });
    expect(back.ingredients.map((i) => i.id)).toEqual([flour!.id]);
    expect(back.ingredients[0]?.deletedAt).toBeNull();
  });

  it('rejects anchors that point outside the recipe, and levain without hydration', async () => {
    const { repos } = await createTestDb();
    await expect(
      repos.recipes.create(
        recipeInput({
          steps: [step({ anchor: { type: 'alongside', stepId: 'ghost', align: 'endsAtStart' } })],
        }),
      ),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      repos.recipes.create(
        recipeInput({ ingredients: [{ name: 'Levain', role: 'levain', amountG: 100 }] }),
      ),
    ).rejects.toThrow(/CHECK/);
    expect(await repos.recipes.list()).toEqual([]); // failed creates left nothing behind
  });

  it('soft delete cascades, hides from reads and keeps rows', async () => {
    const { repos, db } = await createTestDb();
    const created = await repos.recipes.create(
      recipeInput({ recipe: { name: 'A', seedKey: 'recipe:a' } }),
    );
    await repos.recipes.create(recipeInput({ recipe: { name: 'b', favorite: true }, steps: [] }));
    expect((await repos.recipes.list()).map((r) => r.name)).toEqual(['b', 'A']); // favorites first
    expect(await repos.recipes.softDelete(created.recipe.id)).toBe(true);
    expect(await repos.recipes.softDelete(created.recipe.id)).toBe(false);
    expect(await repos.recipes.get(created.recipe.id)).toBeNull();
    expect((await repos.recipes.list()).map((r) => r.name)).toEqual(['b']);
    const tomb = await repos.recipes.get(created.recipe.id, { includeDeleted: true });
    expect(tomb?.recipe.deletedAt).not.toBeNull();
    expect(tomb?.ingredients).toHaveLength(3);
    expect(tomb?.ingredients.every((i) => i.deletedAt !== null)).toBe(true);
    expect(tomb?.steps.every((s) => s.deletedAt !== null)).toBe(true);
    const n = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM recipe');
    expect(n?.n).toBe(2);
    expect((await repos.recipes.findBySeedKey('recipe:a'))?.id).toBe(created.recipe.id);
  });

  it('update on a missing recipe throws notFound', async () => {
    const { repos } = await createTestDb();
    await expect(repos.recipes.update('nope', { recipe: { name: 'x' } })).rejects.toMatchObject({
      code: 'notFound',
    });
  });

  it('a recipe line keeps pointing at an archived pantry item', async () => {
    const { repos } = await createTestDb();
    const flour = await repos.pantry.create({ name: 'Flour' });
    const r = await repos.recipes.create(
      recipeInput({
        ingredients: [{ name: 'Flour', role: 'flour', amountG: 500, pantryItemId: flour.id }],
      }),
    );
    await repos.pantry.archive(flour.id);
    const reloaded = await repos.recipes.get(r.recipe.id);
    expect(reloaded?.ingredients[0]?.pantryItemId).toBe(flour.id);
  });

  it('transaction() groups writes across repositories and rolls back together', async () => {
    const { repos } = await createTestDb();
    await expect(
      repos.transaction(async (tx) => {
        await tx.pantry.create({ name: 'Rolled back' });
        await tx.recipes.create(recipeInput());
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');
    expect(await repos.pantry.list()).toEqual([]);
    expect(await repos.recipes.list()).toEqual([]);
    await repos.transaction(async (tx) => {
      await tx.pantry.create({ name: 'Kept' });
      await tx.recipes.create(recipeInput());
    });
    expect(await repos.pantry.list()).toHaveLength(1);
    expect(await repos.recipes.list()).toHaveLength(1);
  });

  describe('restore', () => {
    it('undoes softDelete, restoring children deleted with the recipe but not earlier ones', async () => {
      const { repos, clock } = await createTestDb();
      const created = await repos.recipes.create(recipeInput());
      const id = created.recipe.id;
      const [flour, water, levain] = created.ingredients;
      // An earlier edit removes the water line.
      clock.advance(1000);
      await repos.recipes.update(id, {
        ingredients: [flour!, levain!].map((i) => ({ ...i })),
      });
      clock.advance(1000);
      expect(await repos.recipes.softDelete(id)).toBe(true);
      expect(await repos.recipes.get(id)).toBeNull();

      clock.advance(1000);
      expect(await repos.recipes.restore(id)).toBe(true);
      const back = await repos.recipes.get(id);
      expect(back?.recipe.deletedAt).toBeNull();
      expect(back?.recipe.updatedAt).toBe(clock.nowIso());
      expect(back?.ingredients.map((i) => i.id)).toEqual([flour!.id, levain!.id]);
      expect(back?.ingredients.some((i) => i.id === water!.id)).toBe(false);
      expect(back?.steps.map((s) => s.id)).toEqual(['bake', 'preheat']);
    });

    it('is a no-op (false) for a live or unknown recipe', async () => {
      const { repos } = await createTestDb();
      const created = await repos.recipes.create(recipeInput());
      expect(await repos.recipes.restore(created.recipe.id)).toBe(false);
      expect(await repos.recipes.restore('missing')).toBe(false);
    });
  });
});
