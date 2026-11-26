import { createTestDb } from './test-utils';

describe('settings repository', () => {
  it('ensure creates the row with schema defaults and is idempotent', async () => {
    const { repos, clock } = await createTestDb();
    expect(await repos.settings.get()).toBeNull();
    const created = await repos.settings.ensure();
    expect(created).toMatchObject({
      id: 'settings',
      unitSystem: 'metric',
      quietHoursEnabled: true,
      quietStartMin: 1320,
      quietEndMin: 360,
      ovenCapacity: 1,
      markupBps: 20000,
      headsUpMin: 10,
      keepAwakeDefault: true,
      currencyOverride: null,
      createdAt: '2026-11-26T12:00:00.000Z',
      deletedAt: null,
    });
    clock.advance(1000);
    expect(await repos.settings.ensure({ unitSystem: 'us' })).toEqual(created);
  });

  it('ensure applies initial values, edit changes updatedAt only, reload is stable', async () => {
    const { repos, clock } = await createTestDb();
    await repos.settings.ensure({ unitSystem: 'us', temperatureUnit: 'F' });
    clock.advance(60_000);
    const edited = await repos.settings.update({ ovenCapacity: 2, quietHoursEnabled: false });
    expect(edited).toMatchObject({
      unitSystem: 'us',
      temperatureUnit: 'F',
      ovenCapacity: 2,
      quietHoursEnabled: false,
      createdAt: '2026-11-26T12:00:00.000Z',
      updatedAt: '2026-11-26T12:01:00.000Z',
    });
    expect(await repos.settings.get()).toEqual(edited);
  });

  it('soft delete hides the row, keeps it, and ensure revives it', async () => {
    const { repos, db } = await createTestDb();
    await repos.settings.ensure({ markupBps: 15000 });
    expect(await repos.settings.softDelete()).toBe(true);
    expect(await repos.settings.get()).toBeNull();
    expect((await repos.settings.get({ includeDeleted: true }))?.deletedAt).not.toBeNull();
    const row = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM settings');
    expect(row?.n).toBe(1);
    await expect(repos.settings.update({ ovenCapacity: 3 })).rejects.toMatchObject({
      code: 'notFound',
    });
    expect((await repos.settings.ensure())?.markupBps).toBe(15000);
  });

  it('rejects out-of-range values through the schema', async () => {
    const { repos } = await createTestDb();
    await repos.settings.ensure();
    await expect(repos.settings.update({ ovenCapacity: 99 })).rejects.toThrow(/CHECK/);
  });
});

describe('meta repository', () => {
  it('sets, overwrites, reads and deletes', async () => {
    const { repos } = await createTestDb();
    expect(await repos.meta.get('seedVersion')).toBeNull();
    await repos.meta.set('seedVersion', '1');
    await repos.meta.set('seedVersion', '2');
    expect(await repos.meta.get('seedVersion')).toBe('2');
    await repos.meta.delete('seedVersion');
    expect(await repos.meta.get('seedVersion')).toBeNull();
  });
});
