import { bakeInput, bakeStep, snapshot } from './fixtures';
import { createTestDb } from './test-utils';

describe('bake repository', () => {
  it('creates a bake with items and steps and reloads it', async () => {
    const { repos } = await createTestDb();
    const created = await repos.bakes.create(bakeInput());
    expect(created.bake).toMatchObject({
      status: 'scheduled',
      mode: 'backward',
      timeZone: 'America/New_York',
      ovenCapacity: 2,
      reheatGapMin: 0,
      ovenSlots: [],
      notes: '',
      startedAt: null,
    });
    expect(created.items).toHaveLength(1);
    expect(created.items[0]).toMatchObject({
      id: 'item1',
      position: 0,
      loaves: 2,
      scaleFactor: 2,
      costSnapshot: null,
      recipeSnapshot: snapshot(),
    });
    expect(created.steps.map((s) => [s.id, s.position, s.status, s.foldTimes, s.notify])).toEqual([
      ['s1', 0, 'pending', [], true],
      ['s2', 1, 'pending', [], true],
    ]);
    expect(created.steps[1]).toMatchObject({ bakeItemId: null, isAlongside: true });
    expect(await repos.bakes.get(created.bake.id)).toEqual(created);
  });

  it('round-trips JSON columns', async () => {
    const { repos } = await createTestDb();
    const slots = [
      {
        index: 1,
        startAt: '2026-11-28T14:00:00.000Z',
        endAt: '2026-11-28T14:45:00.000Z',
        loaves: [{ bakeItemId: 'item1', loaves: 2 }],
      },
    ];
    const cost = {
      snapshotVersion: 1 as const,
      currencyCode: 'USD',
      computedAt: '2026-11-26T12:00:00.000Z',
      breakdown: { totalCents: 278 },
      sellPriceCents: 700,
      markupBps: 20000,
    };
    const base = bakeInput();
    const created = await repos.bakes.create({
      ...base,
      bake: { ...base.bake, ovenSlots: slots },
      items: [{ ...base.items[0]!, costSnapshot: cost }],
    });
    expect(created.bake.ovenSlots).toEqual(slots);
    expect(created.items[0]?.costSnapshot).toEqual(cost);
  });

  it('edits bake fields; originalReadyAt is untouched by a plan change', async () => {
    const { repos, clock } = await createTestDb();
    const created = await repos.bakes.create(bakeInput());
    clock.advance(60_000);
    const edited = await repos.bakes.update(created.bake.id, {
      status: 'active',
      startedAt: '2026-11-27T10:00:00.000Z',
      plannedReadyAt: '2026-11-28T15:40:00.000Z',
      notes: 'late start',
    });
    expect(edited).toMatchObject({
      status: 'active',
      plannedReadyAt: '2026-11-28T15:40:00.000Z',
      originalReadyAt: '2026-11-28T15:00:00.000Z',
      notes: 'late start',
      createdAt: created.bake.createdAt,
      updatedAt: '2026-11-26T12:01:00.000Z',
    });
    await expect(repos.bakes.update('nope', { notes: 'x' })).rejects.toMatchObject({
      code: 'notFound',
    });
  });

  it('applies step progress and plan changes in one transaction', async () => {
    const { repos, clock } = await createTestDb();
    const created = await repos.bakes.create(bakeInput());
    clock.advance(1000);
    const updated = await repos.bakes.updateSteps(created.bake.id, [
      {
        id: 's1',
        status: 'done',
        actualStartAt: '2026-11-27T10:05:00.000Z',
        actualEndAt: '2026-11-27T16:20:00.000Z',
        inferredDone: true,
        foldsDone: 4,
        foldTimes: ['2026-11-27T10:30:00.000Z'],
      },
      {
        id: 's2',
        plannedStartAt: '2026-11-28T13:40:00.000Z',
        plannedEndAt: '2026-11-28T14:40:00.000Z',
      },
    ]);
    expect(updated[0]).toMatchObject({
      status: 'done',
      inferredDone: true,
      foldsDone: 4,
      foldTimes: ['2026-11-27T10:30:00.000Z'],
      originalPlannedStartAt: '2026-11-27T10:00:00.000Z',
      updatedAt: '2026-11-26T12:00:01.000Z',
    });
    expect(updated[1]).toMatchObject({
      plannedStartAt: '2026-11-28T13:40:00.000Z',
      originalPlannedStartAt: '2026-11-28T13:00:00.000Z',
    });

    await expect(
      repos.bakes.updateSteps(created.bake.id, [
        { id: 's1', status: 'pending' },
        { id: 'ghost', status: 'done' },
      ]),
    ).rejects.toMatchObject({ code: 'notFound' });
    const after = await repos.bakes.get(created.bake.id);
    expect(after?.steps[0]?.status).toBe('done'); // the failed batch wrote nothing
  });

  it('rejects a duplicate step key within a bake', async () => {
    const { repos } = await createTestDb();
    const base = bakeInput();
    await expect(
      repos.bakes.create({ ...base, steps: [bakeStep({ id: 'a' }), bakeStep({ id: 'b' })] }),
    ).rejects.toThrow(/UNIQUE/);
    expect(await repos.bakes.list()).toEqual([]);
  });

  it('adds steps after the last position', async () => {
    const { repos } = await createTestDb();
    const created = await repos.bakes.create(bakeInput());
    const added = await repos.bakes.addSteps(created.bake.id, [
      bakeStep({ id: 's3', stepKey: 'item1:cool', name: 'Cool', kind: 'cool' }),
    ]);
    expect(added.map((s) => [s.id, s.position])).toEqual([['s3', 2]]);
  });

  it('edits and removes items; removal tombstones the item steps', async () => {
    const { repos } = await createTestDb();
    const created = await repos.bakes.create(bakeInput());
    const item = await repos.bakes.updateItem('item1', { loaves: 3, scaleFactor: 3 });
    expect(item).toMatchObject({ loaves: 3, scaleFactor: 3, recipeSnapshot: snapshot() });
    expect(await repos.bakes.removeItem('item1')).toBe(true);
    expect(await repos.bakes.removeItem('item1')).toBe(false);
    const after = await repos.bakes.get(created.bake.id);
    expect(after?.items).toEqual([]);
    expect(after?.steps.map((s) => s.id)).toEqual(['s2']);
  });

  it('lists by status ordered by planned ready time and hides deleted bakes', async () => {
    const { repos, db } = await createTestDb();
    const base = bakeInput();
    const late = await repos.bakes.create({
      ...base,
      bake: { ...base.bake, plannedReadyAt: '2026-12-01T10:00:00.000Z' },
      items: [],
      steps: [],
    });
    const early = await repos.bakes.create({
      ...base,
      bake: { ...base.bake, status: 'active', plannedReadyAt: '2026-11-29T10:00:00.000Z' },
      items: [],
      steps: [],
    });
    expect((await repos.bakes.list()).map((b) => b.id)).toEqual([early.bake.id, late.bake.id]);
    expect(
      (await repos.bakes.list({ statuses: ['scheduled', 'completed'] })).map((b) => b.id),
    ).toEqual([late.bake.id]);

    const full = await repos.bakes.create(bakeInput());
    expect(await repos.bakes.softDelete(full.bake.id)).toBe(true);
    expect(await repos.bakes.softDelete(full.bake.id)).toBe(false);
    expect(await repos.bakes.get(full.bake.id)).toBeNull();
    expect((await repos.bakes.list()).map((b) => b.id)).not.toContain(full.bake.id);
    const tomb = await repos.bakes.get(full.bake.id, { includeDeleted: true });
    expect(tomb?.items.every((i) => i.deletedAt !== null)).toBe(true);
    expect(tomb?.steps).toHaveLength(2);
    expect(tomb?.steps.every((s) => s.deletedAt !== null)).toBe(true);
    const n = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM bake_step');
    expect(n?.n).toBe(2);
  });

  it('keeps a bake readable after its recipe is deleted (snapshot is authoritative)', async () => {
    const { repos } = await createTestDb();
    const recipe = await repos.recipes.create({
      recipe: { name: 'R' },
      ingredients: [],
      steps: [],
    });
    const base = bakeInput();
    const bake = await repos.bakes.create({
      ...base,
      items: [{ ...base.items[0]!, recipeId: recipe.recipe.id }],
    });
    await repos.recipes.softDelete(recipe.recipe.id);
    const reloaded = await repos.bakes.get(bake.bake.id);
    expect(reloaded?.items[0]).toMatchObject({
      recipeId: recipe.recipe.id,
      recipeSnapshot: snapshot(),
    });
  });
});
