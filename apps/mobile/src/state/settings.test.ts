import { createTestDb, type TestDb } from '../db/test-utils';
import { PROVISIONAL_SETTINGS_DEFAULTS, useSettings } from './settings';

let t: TestDb;
beforeEach(async () => {
  t = await createTestDb();
  useSettings.getState().reset();
});
afterEach(() => t.db.close());

const us = { unitSystem: 'us', temperatureUnit: 'F' } as const;
const metric = { unitSystem: 'metric', temperatureUnit: 'C' } as const;

describe('useSettings', () => {
  it('starts idle with no settings', () => {
    expect(useSettings.getState()).toMatchObject({ status: 'idle', settings: null });
  });

  it('creates the row on first hydrate from locale and provisional defaults', async () => {
    await useSettings.getState().hydrate(t.repos.settings, us);
    const { status, settings } = useSettings.getState();
    expect(status).toBe('ready');
    expect(settings).toMatchObject({
      unitSystem: 'us',
      temperatureUnit: 'F',
      quietHoursEnabled: true,
      quietStartMin: 1320,
      quietEndMin: 360,
      markupBps: 20000,
      ovenCapacity: 1,
      reheatGapMin: 0,
    });
    expect(PROVISIONAL_SETTINGS_DEFAULTS.markupBps).toBe(20000);
  });

  it('keeps stored values on later launches and ignores new locale defaults', async () => {
    await useSettings.getState().hydrate(t.repos.settings, us);
    await useSettings.getState().update({ markupBps: 30000 });
    useSettings.getState().reset();
    await useSettings.getState().hydrate(t.repos.settings, metric);
    expect(useSettings.getState().settings).toMatchObject({
      unitSystem: 'us',
      markupBps: 30000,
    });
  });

  it('writes through to the database', async () => {
    await useSettings.getState().hydrate(t.repos.settings, metric);
    const saved = await useSettings.getState().update({ ovenCapacity: 3, headsUpMin: 15 });
    expect(saved.ovenCapacity).toBe(3);
    expect(useSettings.getState().settings?.headsUpMin).toBe(15);
    expect(await t.repos.settings.get()).toMatchObject({ ovenCapacity: 3, headsUpMin: 15 });
  });

  it('leaves the store unchanged when a write is rejected', async () => {
    await useSettings.getState().hydrate(t.repos.settings, metric);
    await expect(useSettings.getState().update({ ovenCapacity: 99 })).rejects.toBeDefined();
    expect(useSettings.getState().settings?.ovenCapacity).toBe(1);
    // The queue recovers after a failure.
    await useSettings.getState().update({ ovenCapacity: 2 });
    expect(useSettings.getState().settings?.ovenCapacity).toBe(2);
  });

  it('applies rapid updates in order', async () => {
    await useSettings.getState().hydrate(t.repos.settings, metric);
    const { update } = useSettings.getState();
    await Promise.all([
      update({ headsUpMin: 5 }),
      update({ headsUpMin: 20 }),
      update({ headsUpMin: 30 }),
    ]);
    expect(useSettings.getState().settings?.headsUpMin).toBe(30);
    expect((await t.repos.settings.get())?.headsUpMin).toBe(30);
  });

  it('rejects update before hydrate', async () => {
    await expect(useSettings.getState().update({ ovenCapacity: 2 })).rejects.toThrow(/not loaded/);
  });

  it('reports a hydrate failure', async () => {
    await t.db.close();
    t = await createTestDb();
    const broken = { ensure: () => Promise.reject(new Error('boom')) } as never;
    await expect(useSettings.getState().hydrate(broken, metric)).rejects.toThrow('boom');
    expect(useSettings.getState()).toMatchObject({ status: 'error' });
    expect(useSettings.getState().error?.message).toBe('boom');
  });

  it('reload picks up changes made outside the store', async () => {
    await useSettings.getState().hydrate(t.repos.settings, metric);
    await t.repos.settings.update({ markupBps: 15000 });
    await useSettings.getState().reload();
    expect(useSettings.getState().settings?.markupBps).toBe(15000);
  });
});
