import { createTestDb } from './test-utils';

describe('pantry repository', () => {
  it('creates, reloads with stable id and timestamps, and applies defaults', async () => {
    const { repos } = await createTestDb();
    const item = await repos.pantry.create({ name: 'Salt', category: 'salt', gramsPerCup: 292 });
    expect(item).toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Salt',
      category: 'salt',
      packagePriceCents: null,
      packageSize: null,
      packageUnit: null,
      gramsPerCup: 292,
      gramsPerEach: null,
      store: null,
      pricedAt: null,
      seedKey: null,
      createdAt: '2026-11-26T12:00:00.000Z',
      updatedAt: '2026-11-26T12:00:00.000Z',
      deletedAt: null,
    });
    expect(await repos.pantry.get(item.id)).toEqual(item);
    expect(await repos.priceHistory.listForItem(item.id)).toEqual([]);
  });

  it('logs price history on create and on price change, newest first', async () => {
    const { repos, clock } = await createTestDb();
    const item = await repos.pantry.create({
      name: 'Bread flour',
      packagePriceCents: 499,
      packageSize: 5,
      packageUnit: 'lb',
      store: 'Costco',
    });
    expect(item.pricedAt).toBe('2026-11-26');
    clock.advance(86_400_000);
    const updated = await repos.pantry.update(item.id, { packagePriceCents: 549 });
    expect(updated).toMatchObject({ packagePriceCents: 549, pricedAt: '2026-11-27' });
    const history = await repos.priceHistory.listForItem(item.id);
    expect(history.map((h) => h.packagePriceCents)).toEqual([549, 499]);
    expect(history[0]).toMatchObject({ packageSize: 5, packageUnit: 'lb', store: 'Costco' });

    // A rename is not a price change.
    await repos.pantry.update(item.id, { name: 'AP flour' });
    expect(await repos.priceHistory.listForItem(item.id)).toHaveLength(2);
  });

  it('edit changes updatedAt but not createdAt', async () => {
    const { repos, clock } = await createTestDb();
    const item = await repos.pantry.create({ name: 'Water', category: 'water' });
    clock.advance(5000);
    const edited = await repos.pantry.update(item.id, { name: 'Tap water', store: null });
    expect(edited.createdAt).toBe(item.createdAt);
    expect(edited.updatedAt).toBe('2026-11-26T12:00:05.000Z');
    expect(edited.name).toBe('Tap water');
  });

  it('archive hides from lists and keeps the row; restore brings it back', async () => {
    const { repos, db } = await createTestDb();
    const a = await repos.pantry.create({ name: 'banana' });
    await repos.pantry.create({ name: 'Apple' });
    expect((await repos.pantry.list()).map((i) => i.name)).toEqual(['Apple', 'banana']);
    expect(await repos.pantry.archive(a.id)).toBe(true);
    expect(await repos.pantry.archive(a.id)).toBe(false);
    expect((await repos.pantry.list()).map((i) => i.name)).toEqual(['Apple']);
    expect(await repos.pantry.get(a.id)).toBeNull();
    expect((await repos.pantry.get(a.id, { includeDeleted: true }))?.deletedAt).not.toBeNull();
    expect((await repos.pantry.list({ includeArchived: true })).length).toBe(2);
    const n = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM pantry_item');
    expect(n?.n).toBe(2);
    expect((await repos.pantry.unarchive(a.id)).deletedAt).toBeNull();
  });

  it('finds seed keys including archived rows', async () => {
    const { repos } = await createTestDb();
    const item = await repos.pantry.create({ name: 'Salt', seedKey: 'pantry:salt' });
    await repos.pantry.archive(item.id);
    expect((await repos.pantry.findBySeedKey('pantry:salt'))?.id).toBe(item.id);
    expect(await repos.pantry.findBySeedKey('pantry:none')).toBeNull();
  });

  it('enforces all-or-none price and unknown ids', async () => {
    const { repos } = await createTestDb();
    await expect(repos.pantry.create({ name: 'Bad', packagePriceCents: 100 })).rejects.toThrow(
      /CHECK/,
    );
    await expect(repos.pantry.update('nope', { name: 'x' })).rejects.toMatchObject({
      code: 'notFound',
    });
  });

  it('price history entries can be added and soft deleted', async () => {
    const { repos, db } = await createTestDb();
    const item = await repos.pantry.create({ name: 'Flour' });
    const entry = await repos.priceHistory.add({
      pantryItemId: item.id,
      packagePriceCents: 300,
      packageSize: 2,
      packageUnit: 'kg',
      pricedAt: '2026-10-01',
    });
    expect(await repos.priceHistory.get(entry.id)).toEqual(entry);
    expect(await repos.priceHistory.softDelete(entry.id)).toBe(true);
    expect(await repos.priceHistory.listForItem(item.id)).toEqual([]);
    expect(await repos.priceHistory.listForItem(item.id, { includeDeleted: true })).toHaveLength(1);
    const n = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM price_history');
    expect(n?.n).toBe(1);
    await expect(
      repos.priceHistory.add({
        pantryItemId: 'nope',
        packagePriceCents: 1,
        packageSize: 1,
        packageUnit: 'g',
        pricedAt: '2026-10-01',
      }),
    ).rejects.toMatchObject({ code: 'notFound' });
  });

  it('getByIds keeps order, skips missing, and includes archived only on request', async () => {
    const { repos } = await createTestDb();
    const a = await repos.pantry.create({ name: 'A' });
    const b = await repos.pantry.create({ name: 'B' });
    await repos.pantry.archive(a.id);
    expect(await repos.pantry.getByIds([])).toEqual([]);
    expect((await repos.pantry.getByIds([b.id, a.id, 'ghost'])).map((i) => i.name)).toEqual(['B']);
    expect(
      (await repos.pantry.getByIds([b.id, a.id], { includeArchived: true })).map((i) => i.name),
    ).toEqual(['B', 'A']);
  });

  it('unarchive clears the tombstone, bumps updatedAt, and fails for unknown ids', async () => {
    const { repos, clock } = await createTestDb();
    const a = await repos.pantry.create({ name: 'A' });
    clock.advance(1000);
    await repos.pantry.archive(a.id);
    clock.advance(1000);
    const back = await repos.pantry.unarchive(a.id);
    expect(back.deletedAt).toBeNull();
    expect(back.updatedAt).toBe('2026-11-26T12:00:02.000Z');
    await expect(repos.pantry.unarchive('ghost')).rejects.toMatchObject({ code: 'notFound' });
  });

  it('usedIn lists live recipes with live lines, also for archived items', async () => {
    const { repos } = await createTestDb();
    const flour = await repos.pantry.create({ name: 'Flour' });
    const line = (name: string) => ({
      recipe: { name },
      ingredients: [{ name: 'Flour', role: 'flour' as const, amountG: 1, pantryItemId: flour.id }],
      steps: [],
    });
    const live = await repos.recipes.create(line('Live'));
    const gone = await repos.recipes.create(line('Gone'));
    await repos.recipes.softDelete(gone.recipe.id);
    await repos.pantry.archive(flour.id);
    expect(await repos.pantry.usedIn(flour.id)).toEqual([
      { recipeId: live.recipe.id, name: 'Live' },
    ]);
    await repos.recipes.update(live.recipe.id, { ingredients: [] });
    expect(await repos.pantry.usedIn(flour.id)).toEqual([]);
  });

  describe('price entries', () => {
    const price = (pantryItemId: string, cents: number, pricedAt: string) => ({
      pantryItemId,
      packagePriceCents: cents,
      packageSize: 5,
      packageUnit: 'lb' as const,
      store: 'S',
      pricedAt,
    });

    it('savePrice mirrors when on or after the current date, not when backdated', async () => {
      const { repos } = await createTestDb();
      const item = await repos.pantry.create({
        name: 'Flour',
        packagePriceCents: 400,
        packageSize: 5,
        packageUnit: 'lb',
        pricedAt: '2026-11-01',
      });
      await repos.pantry.savePrice(price(item.id, 450, '2026-11-10'));
      expect((await repos.pantry.get(item.id))?.packagePriceCents).toBe(450);
      await repos.pantry.savePrice(price(item.id, 300, '2026-10-01')); // backdated
      const after = await repos.pantry.get(item.id);
      expect(after).toMatchObject({ packagePriceCents: 450, pricedAt: '2026-11-10' });
      await repos.pantry.savePrice(price(item.id, 460, '2026-11-10')); // same date: newer wins
      expect((await repos.pantry.get(item.id))?.packagePriceCents).toBe(460);
      expect(await repos.priceHistory.listForItem(item.id)).toHaveLength(4);
      await expect(repos.pantry.savePrice(price('ghost', 1, '2026-11-10'))).rejects.toMatchObject({
        code: 'notFound',
      });
    });

    it('savePrice mirrors onto an unpriced item', async () => {
      const { repos } = await createTestDb();
      const item = await repos.pantry.create({ name: 'Flour' });
      await repos.pantry.savePrice(price(item.id, 400, '2026-11-01'));
      expect(await repos.pantry.get(item.id)).toMatchObject({
        packagePriceCents: 400,
        packageSize: 5,
        packageUnit: 'lb',
        store: 'S',
        pricedAt: '2026-11-01',
      });
    });

    it('deletePrice re-mirrors the latest, refuses the last entry, and restorePrice undoes it', async () => {
      const { repos, clock } = await createTestDb();
      const item = await repos.pantry.create({ name: 'Flour' });
      const older = await repos.pantry.savePrice(price(item.id, 400, '2026-11-01'));
      clock.advance(1000);
      const newer = await repos.pantry.savePrice(price(item.id, 500, '2026-11-05'));
      expect((await repos.pantry.get(item.id))?.packagePriceCents).toBe(500);

      await repos.pantry.deletePrice(newer.id);
      expect(await repos.pantry.get(item.id)).toMatchObject({
        packagePriceCents: 400,
        pricedAt: '2026-11-01',
      });
      expect((await repos.priceHistory.listForItem(item.id)).map((h) => h.id)).toEqual([older.id]);

      await expect(repos.pantry.deletePrice(older.id)).rejects.toMatchObject({ code: 'invalid' });
      expect((await repos.priceHistory.listForItem(item.id)).length).toBe(1);

      await repos.pantry.restorePrice(newer.id);
      expect((await repos.pantry.get(item.id))?.packagePriceCents).toBe(500);
      expect(await repos.priceHistory.listForItem(item.id)).toHaveLength(2);
      await expect(repos.pantry.restorePrice('ghost')).rejects.toMatchObject({ code: 'notFound' });
    });
  });
});
