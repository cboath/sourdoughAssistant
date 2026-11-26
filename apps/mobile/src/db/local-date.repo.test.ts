import { createZone } from './deps';
import { recipeInput } from './fixtures';
import { createFakeClock, createTestDb } from './test-utils';

const priced = { packagePriceCents: 499, packageSize: 5, packageUnit: 'lb' as const };

describe('zone', () => {
  it('computes local calendar dates', () => {
    const instant = '2026-11-27T02:30:00.000Z';
    expect(createZone('UTC').localDate(instant)).toBe('2026-11-27');
    expect(createZone('America/New_York').localDate(instant)).toBe('2026-11-26');
    expect(createZone('Pacific/Auckland').localDate('2026-11-26T12:30:00.000Z')).toBe('2026-11-27');
  });
});

describe('priced_at defaults to the local date', () => {
  it('uses the evening local date in a US zone (UTC is already tomorrow)', async () => {
    // 8:30 pm EST on Nov 26 is 01:30 UTC on Nov 27.
    const clock = createFakeClock('2026-11-27T01:30:00.000Z');
    const { repos } = await createTestDb({ clock, timeZone: 'America/New_York' });
    const item = await repos.pantry.create({ name: 'Flour', ...priced });
    expect(item.pricedAt).toBe('2026-11-26');
    expect((await repos.priceHistory.listForItem(item.id))[0]?.pricedAt).toBe('2026-11-26');

    clock.advance(2 * 3600_000); // 10:30 pm EST: still Nov 26 locally
    const updated = await repos.pantry.update(item.id, { packagePriceCents: 550 });
    expect(updated.pricedAt).toBe('2026-11-26');
    clock.advance(3 * 3600_000); // 1:30 am EST: Nov 27 locally
    expect((await repos.pantry.update(item.id, { packagePriceCents: 560 })).pricedAt).toBe(
      '2026-11-27',
    );
  });

  it('uses the next local date in a positive-offset zone', async () => {
    // 22:30 UTC on Nov 26 is 11:30 am on Nov 27 in Auckland (UTC+13).
    const clock = createFakeClock('2026-11-26T22:30:00.000Z');
    const { repos } = await createTestDb({ clock, timeZone: 'Pacific/Auckland' });
    const item = await repos.pantry.create({ name: 'Flour', ...priced });
    expect(item.pricedAt).toBe('2026-11-27');
  });

  it('an explicit pricedAt always wins', async () => {
    const { repos } = await createTestDb({ timeZone: 'America/New_York' });
    const item = await repos.pantry.create({ name: 'Flour', ...priced, pricedAt: '2026-01-02' });
    expect(item.pricedAt).toBe('2026-01-02');
  });
});

describe('create options for seeding', () => {
  it('pantry.create honours id, at and priceHistoryId', async () => {
    const { repos } = await createTestDb({ timeZone: 'America/New_York' });
    const at = '2026-01-01T03:00:00.000Z'; // Dec 31 locally
    const item = await repos.pantry.create(
      { name: 'Flour', ...priced, seedKey: 'pantry:flour' },
      { id: 'p-1', at, priceHistoryId: 'h-1' },
    );
    expect(item).toMatchObject({
      id: 'p-1',
      createdAt: at,
      updatedAt: at,
      pricedAt: '2025-12-31',
    });
    expect(await repos.priceHistory.get('h-1')).toMatchObject({
      createdAt: at,
      pricedAt: '2025-12-31',
    });
  });

  it('recipes.create stamps the recipe and every child with `at`', async () => {
    const { repos } = await createTestDb();
    const at = '2026-01-01T00:00:00.000Z';
    const r = await repos.recipes.create(recipeInput(), { id: 'r-1', at });
    expect(r.recipe).toMatchObject({ id: 'r-1', createdAt: at, updatedAt: at });
    for (const child of [...r.ingredients, ...r.steps]) {
      expect(child).toMatchObject({ createdAt: at, updatedAt: at });
    }
  });

  it('settings.ensure honours at', async () => {
    const { repos } = await createTestDb();
    const at = '2026-01-01T00:00:00.000Z';
    expect(await repos.settings.ensure({}, { at })).toMatchObject({ createdAt: at, updatedAt: at });
  });
});

describe('recipe child changes bump the parent only (N3)', () => {
  const setup = async () => {
    const t = await createTestDb();
    const created = await t.repos.recipes.create(recipeInput());
    t.clock.advance(60_000);
    return { ...t, created, later: '2026-11-26T12:01:00.000Z' };
  };
  const ing = (r: Awaited<ReturnType<typeof setup>>['created']) =>
    r.ingredients.map((i) => ({
      id: i.id,
      name: i.name,
      role: i.role,
      amountG: i.amountG,
      levainHydrationPct: i.levainHydrationPct,
    }));

  it('edit', async () => {
    const { repos, created, later } = await setup();
    const lines = ing(created);
    lines[1] = { ...lines[1]!, amountG: 400 };
    const after = await repos.recipes.update(created.recipe.id, { ingredients: lines });
    expect(after.recipe.updatedAt).toBe(later);
    expect(after.ingredients[0]?.updatedAt).toBe(created.ingredients[0]?.updatedAt);
    expect(after.ingredients[1]?.updatedAt).toBe(later);
    expect(after.ingredients[2]?.updatedAt).toBe(created.ingredients[2]?.updatedAt);
  });

  it('add', async () => {
    const { repos, created, later } = await setup();
    const after = await repos.recipes.update(created.recipe.id, {
      ingredients: [...ing(created), { name: 'Salt', role: 'salt', amountG: 10 }],
    });
    expect(after.recipe.updatedAt).toBe(later);
    expect(after.ingredients).toHaveLength(4);
    expect(after.ingredients[3]).toMatchObject({ createdAt: later, updatedAt: later });
    expect(after.ingredients[0]?.updatedAt).toBe(created.ingredients[0]?.updatedAt);
  });

  it('remove', async () => {
    const { repos, db, created, later } = await setup();
    const after = await repos.recipes.update(created.recipe.id, {
      ingredients: ing(created).slice(0, 2),
    });
    expect(after.recipe.updatedAt).toBe(later);
    expect(after.ingredients).toHaveLength(2);
    expect(after.ingredients[0]?.updatedAt).toBe(created.ingredients[0]?.updatedAt);
    const tomb = await db.get<{ deleted_at: string; updated_at: string }>(
      'SELECT deleted_at, updated_at FROM recipe_ingredient WHERE id = $id',
      { $id: created.ingredients[2]!.id },
    );
    expect(tomb).toEqual({ deleted_at: later, updated_at: later });
  });

  it('reorder touches only the rows whose position changed', async () => {
    const { repos, created, later } = await setup();
    const [a, b, c] = ing(created);
    const after = await repos.recipes.update(created.recipe.id, { ingredients: [a!, c!, b!] });
    expect(after.recipe.updatedAt).toBe(later);
    expect(after.ingredients.map((i) => i.id)).toEqual([a!.id, c!.id, b!.id]);
    expect(after.ingredients[0]?.updatedAt).toBe(created.ingredients[0]?.updatedAt);
    expect(after.ingredients[1]?.updatedAt).toBe(later);
    expect(after.ingredients[2]?.updatedAt).toBe(later);
  });

  it('step edit, add, remove and reorder bump the parent and spare unchanged steps', async () => {
    const { repos, created, later, clock } = await setup();
    const asInput = (s: (typeof created.steps)[number]) => ({
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
    });
    const [bake, preheat] = created.steps.map(asInput);

    const edited = await repos.recipes.update(created.recipe.id, {
      steps: [bake!, { ...preheat!, durationMin: 35 }],
    });
    expect(edited.recipe.updatedAt).toBe(later);
    expect(edited.steps[0]?.updatedAt).toBe(created.steps[0]?.updatedAt);
    expect(edited.steps[1]?.updatedAt).toBe(later);

    clock.advance(60_000);
    const later2 = '2026-11-26T12:02:00.000Z';
    const added = await repos.recipes.update(created.recipe.id, {
      steps: [
        ...edited.steps.map(asInput),
        {
          name: 'Cool',
          kind: 'cool',
          durationMin: 60,
          minMin: 30,
          maxMin: 120,
          tempSensitive: false,
          anchor: { type: 'sequential' },
          folds: null,
          notify: true,
        },
      ],
    });
    expect(added.recipe.updatedAt).toBe(later2);
    expect(added.steps[0]?.updatedAt).toBe(created.steps[0]?.updatedAt);
    expect(added.steps[1]?.updatedAt).toBe(later);
    expect(added.steps[2]?.updatedAt).toBe(later2);

    clock.advance(60_000);
    const later3 = '2026-11-26T12:03:00.000Z';
    const reordered = await repos.recipes.update(created.recipe.id, {
      steps: [added.steps[2]!, added.steps[0]!, added.steps[1]!].map(asInput),
    });
    expect(reordered.recipe.updatedAt).toBe(later3);
    expect(reordered.steps.map((s) => s.name)).toEqual(['Cool', 'Bake', 'Preheat']);

    clock.advance(60_000);
    const removed = await repos.recipes.update(created.recipe.id, {
      steps: [reordered.steps[1]!, reordered.steps[2]!].map(asInput),
    });
    expect(removed.recipe.updatedAt).toBe('2026-11-26T12:04:00.000Z');
    expect(removed.steps.map((s) => s.name)).toEqual(['Bake', 'Preheat']);
  });
});
