import type { BakeAggregate } from '../../../db/types';
import { logger } from '../../../lib/logger';
import { createNotificationService, type BakeReader } from '../service';
import { usePermissions } from '../store';
import { createFakeNotifier, HOUR, MIN, T0, overnightBake, type FakeNotifier } from './fixtures';

function setup(opts: { platform?: 'ios' | 'android'; bakes?: BakeAggregate[] } = {}) {
  const notifier = createFakeNotifier(opts.platform);
  const state = { bakes: opts.bakes ?? [], now: T0, failList: false };
  const reader: BakeReader = {
    async list(options) {
      if (state.failList) throw new Error('db down');
      const wanted = options?.statuses;
      return state.bakes.map((a) => a.bake).filter((b) => !wanted || wanted.includes(b.status));
    },
    async get(id) {
      return state.bakes.find((a) => a.bake.id === id) ?? null;
    },
  };
  const service = createNotificationService({
    bakes: reader,
    notifier,
    now: () => state.now,
    zone: () => 'UTC',
    locale: 'en-US',
    readyEnabled: () => false,
  });
  return { notifier, state, service };
}

const sa1 = (n: FakeNotifier) => n.ids('sa1:');

beforeEach(() => {
  usePermissions.getState().reset();
  logger.clear();
});

describe('reconcile', () => {
  it('schedules the whole desired set on a first run', async () => {
    const bake = overnightBake({ startMs: T0 + HOUR });
    const { notifier, service } = setup({ bakes: [bake] });
    const result = await service.reconcile({ mode: 'rebuild' });
    expect(result).toMatchObject({ status: 'ok', scheduled: 21, failed: 0 });
    expect(sa1(notifier)).toHaveLength(21);
    expect(sa1(notifier).every((id) => id.startsWith(`sa1:${bake.bake.id}:`))).toBe(true);
  });

  it('is idempotent: a second diff changes nothing and the pending set is the same', async () => {
    const { notifier, service } = setup({ bakes: [overnightBake({ startMs: T0 + HOUR })] });
    await service.reconcile({ mode: 'rebuild' });
    const first = sa1(notifier);
    notifier.calls = { schedule: 0, cancel: 0, cancelAll: 0 };
    const again = await service.reconcile({ mode: 'diff' });
    expect(again).toMatchObject({ scheduled: 0, cancelled: 0, kept: 21 });
    expect(notifier.calls).toEqual({ schedule: 0, cancel: 0, cancelAll: 0 });
    expect(sa1(notifier)).toEqual(first);
  });

  it('is idempotent across rebuilds too: the same ids, no duplicates', async () => {
    const { notifier, service } = setup({ bakes: [overnightBake({ startMs: T0 + HOUR })] });
    await service.reconcile({ mode: 'rebuild' });
    const first = sa1(notifier);
    await service.reconcile({ mode: 'rebuild' });
    await service.reconcile({ mode: 'rebuild' });
    expect(sa1(notifier)).toEqual(first);
    expect(new Set(sa1(notifier)).size).toBe(first.length);
  });

  it('cancels stale sa1 entries and leaves satest: and foreign ids alone', async () => {
    const { notifier, service } = setup({ bakes: [overnightBake({ startMs: T0 + HOUR })] });
    notifier.seed('sa1:00000000-0000-4000-8000-0000000000ff:i:old:start', 'deadbeef');
    notifier.seed(`satest:${T0}`);
    notifier.seed('other-app:1');
    await service.reconcile({ mode: 'diff' });
    expect(notifier.store.has('sa1:00000000-0000-4000-8000-0000000000ff:i:old:start')).toBe(false);
    expect(notifier.store.has(`satest:${T0}`)).toBe(true);
    expect(notifier.store.has('other-app:1')).toBe(true);
    await service.reconcile({ mode: 'rebuild' });
    expect(notifier.store.has(`satest:${T0}`)).toBe(true);
    expect(notifier.store.has('other-app:1')).toBe(true);
    expect(notifier.calls.cancelAll).toBe(0);
  });

  it('reschedules only what changed when a step moves (changed hash: cancel, then schedule)', async () => {
    const bake = overnightBake({ startMs: T0 + HOUR });
    const { notifier, state, service } = setup({ bakes: [bake] });
    await service.reconcile();
    const shape = bake.steps.find((s) => s.stepKey === 'i:shape')!;
    shape.plannedStartAt = new Date(Date.parse(shape.plannedStartAt) + 40 * MIN).toISOString();
    notifier.calls = { schedule: 0, cancel: 0, cancelAll: 0 };
    const result = await service.rescheduleBake(bake.bake.id);
    // The shape start and its heads-up.
    expect(result).toMatchObject({ scheduled: 2, cancelled: 2 });
    expect(notifier.intents.get(`sa1:${bake.bake.id}:i:shape:start`)!.fireAtMs).toBe(
      Date.parse(shape.plannedStartAt),
    );
    void state;
  });

  it('drops reminders of steps marked done', async () => {
    const bake = overnightBake({ startMs: T0 + HOUR });
    const { notifier, service } = setup({ bakes: [bake] });
    await service.reconcile();
    bake.steps.find((s) => s.stepKey === 'i:feed')!.status = 'done';
    await service.rescheduleBake(bake.bake.id);
    expect(notifier.ids().some((id) => id.includes(':i:feed:'))).toBe(false);
  });

  it('removes a bake’s reminders when the bake is cancelled or completed', async () => {
    const a = overnightBake({ startMs: T0 + HOUR });
    const b = overnightBake({ startMs: T0 + 2 * HOUR });
    const { notifier, service } = setup({ bakes: [a, b] });
    await service.reconcile();
    expect(notifier.ids(`sa1:${a.bake.id}:`).length).toBeGreaterThan(0);
    a.bake.status = 'cancelled';
    await service.rescheduleBake(a.bake.id);
    expect(notifier.ids(`sa1:${a.bake.id}:`)).toHaveLength(0);
    expect(notifier.ids(`sa1:${b.bake.id}:`).length).toBeGreaterThan(0);
    b.bake.status = 'completed';
    await service.rescheduleBake(b.bake.id);
    expect(sa1(notifier)).toHaveLength(0);
  });

  it('cancelBake removes one bake’s pending requests without reading the database', async () => {
    const a = overnightBake({ startMs: T0 + HOUR });
    const b = overnightBake({ startMs: T0 + 2 * HOUR });
    const { notifier, state, service } = setup({ bakes: [a, b] });
    await service.reconcile();
    notifier.seed(`satest:${T0}`);
    state.failList = true;
    const count = await service.cancelBake(a.bake.id);
    expect(count).toBe(21);
    expect(notifier.ids(`sa1:${a.bake.id}:`)).toHaveLength(0);
    expect(notifier.ids(`sa1:${b.bake.id}:`)).toHaveLength(21);
    expect(notifier.store.has(`satest:${T0}`)).toBe(true);
  });

  it('keeps the budget when several bakes are active', async () => {
    const bakes = Array.from({ length: 5 }, (_, k) =>
      overnightBake({ startMs: T0 + HOUR + k * 7 * MIN }),
    );
    const { notifier, service } = setup({ bakes });
    const result = await service.reconcile({ mode: 'rebuild' });
    expect(sa1(notifier).length).toBeLessThanOrEqual(61);
    expect(result.trimmed.critical).toBeGreaterThan(0);
    expect(usePermissions.getState().budgetTrimmed).toBe(true);
    expect(sa1(notifier).some((id) => id.endsWith(':topup'))).toBe(true);
  });
});

describe('permission handling', () => {
  it.each(['denied', 'undetermined'] as const)(
    'does not schedule or cancel while notifications are %s, and reports it',
    async (permission) => {
      const { notifier, service } = setup({ bakes: [overnightBake({ startMs: T0 + HOUR })] });
      notifier.permission = permission;
      notifier.seed('sa1:00000000-0000-4000-8000-0000000000aa:i:x:start', 'abc');
      const result = await service.reconcile({ mode: 'rebuild' });
      expect(result.status).toBe(permission);
      expect(notifier.calls).toEqual({ schedule: 0, cancel: 0, cancelAll: 0 });
      expect(usePermissions.getState().notifications).toBe(permission);
    },
  );

  it('schedules everything once the permission is granted', async () => {
    const { notifier, service } = setup({ bakes: [overnightBake({ startMs: T0 + HOUR })] });
    notifier.permission = 'denied';
    await service.reconcile();
    notifier.permission = 'granted';
    const result = await service.reconcile({ mode: 'rebuild' });
    expect(result.status).toBe('ok');
    expect(sa1(notifier)).toHaveLength(21);
    expect(usePermissions.getState().notifications).toBe('granted');
  });

  it('reads the Android exact-alarm state before every reconcile and picks the delivery from it', async () => {
    const { notifier, service } = setup({
      platform: 'android',
      bakes: [overnightBake({ startMs: T0 + HOUR })],
    });
    await service.reconcile();
    const startId = notifier.ids().find((id) => id.endsWith('i:feed:start'))!;
    expect(notifier.intents.get(startId)!.delivery).toBe('alarmClock');
    notifier.exact = 'denied';
    const result = await service.reconcile();
    expect(usePermissions.getState().exactAlarm).toBe('denied');
    expect(notifier.intents.get(startId)!.delivery).toBe('bestEffort');
    // Only start and fold change delivery; heads-ups were already bestEffort.
    expect(result.scheduled).toBe(12);
  });
});

describe('failure handling', () => {
  it('counts failures, never throws, and retries just the failed ones next time', async () => {
    const bake = overnightBake({ startMs: T0 + HOUR });
    const { notifier, service } = setup({ bakes: [bake] });
    const failing = `sa1:${bake.bake.id}:i:shape:start`;
    notifier.failFor.add(failing);
    const result = await service.reconcile();
    expect(result).toMatchObject({ status: 'error', failed: 1, scheduled: 20 });
    expect(usePermissions.getState().failedCount).toBe(1);
    notifier.failFor.clear();
    const retry = await service.reconcile();
    expect(retry).toMatchObject({ status: 'ok', scheduled: 1, kept: 20 });
    expect(usePermissions.getState().failedCount).toBe(0);
  });

  it('turns a database failure into an error result', async () => {
    const { state, service } = setup({ bakes: [overnightBake({ startMs: T0 + HOUR })] });
    state.failList = true;
    await expect(service.reconcile()).resolves.toMatchObject({ status: 'error' });
  });
});

describe('single flight', () => {
  it('never overlaps runs and collapses concurrent requests into one queued run', async () => {
    const { notifier, service } = setup({ bakes: [overnightBake({ startMs: T0 + HOUR })] });
    let active = 0;
    let maxActive = 0;
    let runs = 0;
    const original = notifier.getPermission.bind(notifier);
    notifier.getPermission = async () => {
      runs += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return original();
    };
    await Promise.all([
      service.reconcile(),
      service.reconcile(),
      service.reconcile({ mode: 'rebuild' }),
      service.reconcile(),
    ]);
    expect(maxActive).toBe(1);
    // One in flight plus one queued; a run's own permission read happens once.
    expect(runs).toBeLessThanOrEqual(2);
    expect(sa1(notifier)).toHaveLength(21);
  });
});

describe('test reminder', () => {
  it('schedules one satest: reminder 10 s out and replaces a pending one', async () => {
    const { notifier, state, service } = setup();
    expect(await service.scheduleTestReminder()).toBe(true);
    state.now += 3_000;
    expect(await service.scheduleTestReminder()).toBe(true);
    const ids = notifier.ids('satest:');
    expect(ids).toEqual([`satest:${T0 + 3_000}`]);
    const intent = notifier.intents.get(ids[0]!)!;
    expect(intent.fireAtMs).toBe(T0 + 3_000 + 10_000);
    expect(intent.data).toMatchObject({ v: 1, kind: 'test' });
    expect(intent.interruptionLevel).toBe('timeSensitive');
  });

  it('survives reconcile in both modes', async () => {
    const { notifier, service } = setup({ bakes: [overnightBake({ startMs: T0 + HOUR })] });
    await service.scheduleTestReminder();
    await service.reconcile({ mode: 'rebuild' });
    await service.reconcile({ mode: 'diff' });
    expect(notifier.ids('satest:')).toHaveLength(1);
  });

  it('does nothing when notifications are denied', async () => {
    const { notifier, service } = setup();
    notifier.permission = 'denied';
    expect(await service.scheduleTestReminder()).toBe(false);
    expect(notifier.calls.schedule).toBe(0);
  });
});

describe('logging', () => {
  it('records counts only, never names, notes or ids', async () => {
    const bake = overnightBake({ startMs: T0 + HOUR, recipes: ['Smith wedding order'] });
    const { notifier, service } = setup({ bakes: [bake] });
    notifier.failFor.add(`sa1:${bake.bake.id}:i:shape:start`);
    await service.reconcile({ mode: 'rebuild' });
    await service.cancelBake(bake.bake.id);
    const text = JSON.stringify(logger.entries());
    expect(text).not.toMatch(/Smith|SECRET|PRIVATE|sa1:|Shape/);
  });
});
