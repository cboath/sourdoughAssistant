import { createTestDb, type TestDb } from '../test-utils';
import {
  SEED_CATALOG,
  SEED_DATE,
  SEED_EPOCH,
  SEED_VERSION,
  seedDatabase,
  type SeedCatalog,
} from './index';

let t: TestDb;
beforeEach(async () => {
  t = await createTestDb();
});
afterEach(() => t.db.close());

const count = async (table: string): Promise<number> =>
  (await t.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))?.n ?? 0;

const run = (opts: Parameters<typeof seedDatabase>[1] = {}) => seedDatabase(t.repos, opts);

describe('seedDatabase', () => {
  it('creates the starter pantry, three recipes and records the version', async () => {
    const result = await run();
    expect(result.recipesCreated).toHaveLength(3);
    expect(result.pantryCreated).toHaveLength(SEED_CATALOG.pantry.length);
    expect(await t.repos.meta.get('seedVersion')).toBe(String(SEED_VERSION));
    expect(await count('price_history')).toBe(SEED_CATALOG.pantry.length);
  });

  it('is idempotent: a second run changes nothing', async () => {
    await run();
    const before = await Promise.all(
      ['pantry_item', 'recipe', 'recipe_ingredient', 'step', 'price_history'].map(count),
    );
    const second = await run();
    expect(second.recipesCreated).toEqual([]);
    expect(second.pantryCreated).toEqual([]);
    const after = await Promise.all(
      ['pantry_item', 'recipe', 'recipe_ingredient', 'step', 'price_history'].map(count),
    );
    expect(after).toEqual(before);
  });

  it('does not recreate a deleted seed recipe or archived pantry item', async () => {
    await run();
    const recipe = await t.repos.recipes.findBySeedKey('recipe:whole-wheat-loaf');
    const item = await t.repos.pantry.findBySeedKey('pantry:cheddar');
    await t.repos.recipes.softDelete(recipe!.id);
    await t.repos.pantry.archive(item!.id);
    await t.repos.meta.set('seedVersion', '0'); // force a full re-run
    const again = await run();
    expect(again.recipesCreated).toEqual([]);
    expect(again.pantryCreated).toEqual([]);
    expect(await t.repos.recipes.list()).toHaveLength(2);
  });

  it('adds only entries newer than the stored version when the version is bumped', async () => {
    await run();
    const catalog: SeedCatalog = {
      pantry: [
        ...SEED_CATALOG.pantry,
        {
          seedKey: 'pantry:rye-flour',
          id: '5eed0001-0000-4000-8000-000000000099',
          priceHistoryId: '5eed0002-0000-4000-8000-000000000099',
          sinceVersion: 2,
          item: { name: 'Rye flour', category: 'flour' },
        },
      ],
      recipes: [
        ...SEED_CATALOG.recipes,
        {
          seedKey: 'recipe:rye',
          id: '5eed0003-0000-4000-8000-000000000099',
          sinceVersion: 2,
          recipe: { name: 'Rye' },
          ingredients: [
            {
              id: '5eed0004-0000-4000-8000-000000000999',
              name: 'Rye flour',
              role: 'flour',
              amountG: 500,
              pantryKey: 'pantry:rye-flour',
            },
          ],
          steps: [],
        },
      ],
    };
    const recipeToDelete = await t.repos.recipes.findBySeedKey('recipe:country-loaf');
    await t.repos.recipes.softDelete(recipeToDelete!.id);

    const result = await run({ catalog, version: 2 });
    expect(result.pantryCreated).toEqual(['pantry:rye-flour']);
    expect(result.recipesCreated).toEqual(['recipe:rye']);
    expect(await t.repos.meta.get('seedVersion')).toBe('2');
    const rye = await t.repos.recipes.findBySeedKey('recipe:rye');
    const agg = await t.repos.recipes.get(rye!.id);
    const ryeItem = await t.repos.pantry.findBySeedKey('pantry:rye-flour');
    expect(agg!.ingredients[0]!.pantryItemId).toBe(ryeItem!.id);
  });

  it('rolls everything back when a seed fails', async () => {
    const catalog: SeedCatalog = {
      pantry: SEED_CATALOG.pantry,
      recipes: [
        {
          seedKey: 'recipe:bad',
          id: '5eed0003-0000-4000-8000-000000000098',
          sinceVersion: 1,
          recipe: { name: 'Bad' },
          ingredients: [],
          steps: [
            {
              ...SEED_CATALOG.recipes[0]!.steps[0]!,
              alongsideOf: 'missing',
            },
          ],
        },
      ],
    };
    await expect(run({ catalog })).rejects.toThrow(/unknown step/);
    expect(await count('pantry_item')).toBe(0);
    expect(await t.repos.meta.get('seedVersion')).toBeNull();
  });
});

describe('fixed ids and timestamps (sync readiness N1)', () => {
  const dump = async (db: TestDb['db']) => ({
    pantry: await db.all('SELECT * FROM pantry_item ORDER BY id'),
    history: await db.all('SELECT * FROM price_history ORDER BY id'),
    recipes: await db.all('SELECT * FROM recipe ORDER BY id'),
    ingredients: await db.all('SELECT * FROM recipe_ingredient ORDER BY id'),
    steps: await db.all('SELECT * FROM step ORDER BY id'),
  });

  it('produces identical rows, ids and timestamps in two independently seeded databases', async () => {
    const other = await createTestDb();
    try {
      other.clock.set('2031-05-05T05:05:05.000Z'); // a later install must not change anything
      await run();
      await seedDatabase(other.repos);
      expect(await dump(other.db)).toEqual(await dump(t.db));
    } finally {
      await other.db.close();
    }
  });

  it('stamps every row with the fixed seed timestamp and priced date', async () => {
    t.clock.set('2030-01-01T00:00:00.000Z');
    await run();
    for (const table of ['pantry_item', 'price_history', 'recipe', 'recipe_ingredient', 'step']) {
      const rows = await t.db.all<{ created_at: string; updated_at: string }>(
        `SELECT created_at, updated_at FROM ${table}`,
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.created_at).toBe(SEED_EPOCH);
        expect(row.updated_at).toBe(SEED_EPOCH);
      }
    }
    const dates = await t.db.all<{ priced_at: string }>('SELECT priced_at FROM price_history');
    expect(new Set(dates.map((d) => d.priced_at))).toEqual(new Set([SEED_DATE]));
  });

  it('uses the catalog ids and keeps the preheat anchored to the fixed bake step id', async () => {
    await run();
    const recipe = SEED_CATALOG.recipes[0]!;
    const agg = (await t.repos.recipes.get(recipe.id))!;
    expect(agg.ingredients.map((i) => i.id)).toEqual(recipe.ingredients.map((i) => i.id));
    expect(agg.steps.map((s) => s.id)).toEqual(recipe.steps.map((s) => s.id));
    const covered = recipe.steps.find((s) => s.key === 'bakeCovered')!;
    const preheat = agg.steps.find((s) => s.kind === 'preheat')!;
    expect(preheat.anchor).toMatchObject({ type: 'alongside', stepId: covered.id });
    expect((await t.repos.pantry.findBySeedKey('pantry:salt'))!.id).toBe(
      SEED_CATALOG.pantry.find((p) => p.seedKey === 'pantry:salt')!.id,
    );
  });

  it('has no duplicate ids anywhere in the catalog', () => {
    const all = [
      ...SEED_CATALOG.pantry.flatMap((p) => [p.id, p.priceHistoryId]),
      ...SEED_CATALOG.recipes.flatMap((r) => [
        r.id,
        ...r.ingredients.map((i) => i.id),
        ...r.steps.map((s) => s.id),
      ]),
    ];
    expect(new Set(all).size).toBe(all.length);
    for (const id of all)
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('default process recipe', () => {
  it('matches the PRD example: 77.3% hydration and $1.39 per loaf', async () => {
    await run();
    const recipe = await t.repos.recipes.findBySeedKey('recipe:country-loaf');
    const agg = (await t.repos.recipes.get(recipe!.id))!;
    const pantry = await t.repos.pantry.list();
    const byId = new Map(pantry.map((p) => [p.id, p]));

    let flour = 0;
    let water = 0;
    let costCents = 0;
    for (const line of agg.ingredients) {
      const item = byId.get(line.pantryItemId!)!;
      const perG = item.packagePriceCents! / item.packageSize!;
      if (line.role === 'levain') {
        const f = line.amountG / (1 + line.levainHydrationPct! / 100);
        flour += f;
        water += line.amountG - f;
        costCents += Math.round(f * perG); // water part of the levain is free
      } else {
        if (line.role === 'flour') flour += line.amountG;
        if (line.role === 'water') water += line.amountG;
        costCents += Math.round(line.amountG * perG);
      }
    }
    expect(Math.round((water / flour) * 1000) / 10).toBe(77.3);
    expect(costCents).toBe(139);

    const total = agg.ingredients.reduce((sum, l) => sum + l.amountG, 0);
    expect(total).toBe(agg.recipe.doughWeightG);
  });

  it('has the ten template steps with the preheat anchored alongside the covered bake', async () => {
    await run();
    const recipe = await t.repos.recipes.findBySeedKey('recipe:country-loaf');
    const { steps } = (await t.repos.recipes.get(recipe!.id))!;
    expect(steps.map((s) => s.name)).toEqual([
      'Final starter feeding',
      'Mix and rest',
      'Stretch and folds',
      'Bulk ferment',
      'Shape',
      'Cold ferment (fridge)',
      'Preheat oven and Dutch oven',
      'Bake, covered',
      'Bake, uncovered',
      'Cool',
    ]);
    const preheat = steps.find((s) => s.kind === 'preheat')!;
    const covered = steps.find((s) => s.name === 'Bake, covered')!;
    expect(preheat.anchor).toEqual({
      type: 'alongside',
      stepId: covered.id,
      align: 'endsAtStart',
      offsetMin: 0,
    });
    expect(steps.filter((s) => s.tempSensitive).map((s) => s.kind)).toEqual(['bulk']);
    expect(steps.find((s) => s.kind === 'fold')!.folds).toEqual({ count: 4, intervalMin: 30 });
  });

  it('gives each recipe its own step ids', async () => {
    await run();
    expect(await count('step')).toBe(30);
  });
});
