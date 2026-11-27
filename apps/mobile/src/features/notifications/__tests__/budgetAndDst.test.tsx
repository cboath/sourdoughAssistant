/**
 * QA-04: the iOS budget with several real bakes (ADR 0011 section 3, T-IOS-CAP-*) and the DST
 * nights (ADR 0005 elapsed-time model, T-REB-8), through the real service and repository. Only the
 * OS queue is fake.
 */
import { fromIso } from '@sourdough/core';
import { IOS_PENDING_CAP, SENTINEL_ID } from '../constants';
import { planNotifications } from '../planner';
import { usePermissions } from '../store';
import {
  COUNTRY,
  MIN,
  NOW,
  WHOLE_WHEAT,
  ZONE,
  at,
  makeBake,
  seededDb,
} from '../../live/__tests__/helpers';
import { HOUR, makeBake as makeSpecBake } from './fixtures';
import { createHarness, type Harness } from './seamHarness';
import type { PlannerInput } from '../types';

jest.setTimeout(30_000);

let h: Harness | null = null;
afterEach(() => {
  h?.dispose();
  h = null;
});

async function setup(options: { platform?: 'ios' | 'android'; now?: number; zone?: string } = {}) {
  const db = await seededDb();
  h = createHarness(db, { now: NOW, zone: ZONE, ...options });
  return h;
}

const FOUR = [{ id: COUNTRY }, { id: WHOLE_WHEAT }, { id: COUNTRY }, { id: WHOLE_WHEAT }];
const kindsOf = (ctx: Harness, bakeId?: string) => {
  const out: Record<string, number> = {};
  for (const id of ctx.pending(bakeId)) {
    const kind = ctx.intent(id).kind;
    out[kind] = (out[kind] ?? 0) + 1;
  }
  return out;
};

describe('the 4-recipe bake: one bake alone fills the iOS budget', () => {
  it('4 recipes x 2 oven slots: 18 starts and 6 extra folds all fit, 36 of 38 heads-ups fit, 60 pending', async () => {
    const ctx = await setup();
    const bake = await makeBake(ctx.db, {
      service: ctx.bakeService,
      recipes: FOUR,
      ovenCapacity: 2,
      itemTag: 'a',
    });
    expect(bake.items).toHaveLength(4);
    expect(kindsOf(ctx)).toEqual({ start: 18, fold: 6, headsup: 36 });
    expect(ctx.pending()).toHaveLength(60);
    // Four recipes, so the letters A to D name them (never a fifth).
    const bodies = ctx.pending().map((id) => ctx.intent(id).body);
    for (const letter of ['A', 'B', 'C', 'D'])
      expect(bodies.some((b) => b.includes(letter))).toBe(true);
    // Two heads-ups did not fit, so the "some reminders are trimmed" hint is on.
    expect(usePermissions.getState().budgetTrimmed).toBe(true);
  });
});

describe('budget trimming with two concurrent bakes (T-IOS-CAP-2, T-IOS-CAP-3)', () => {
  async function twoBigBakes() {
    const ctx = await setup();
    const a = await makeBake(ctx.db, {
      service: ctx.bakeService,
      recipes: FOUR,
      ovenCapacity: 2,
      itemTag: 'a',
    });
    const b = await makeBake(ctx.db, {
      service: ctx.bakeService,
      recipes: FOUR,
      ovenCapacity: 2,
      itemTag: 'b',
      ready: { date: '2026-11-28', time: '14:00' },
    });
    return { ...ctx, a, b };
  }

  it('keeps every start and fold of both bakes and trims only the latest heads-ups to 60', async () => {
    const ctx = await twoBigBakes();
    expect(ctx.pending()).toHaveLength(60);
    // 36 starts + 12 folds, none dropped; heads-ups cut from 74 to the 12 soonest.
    expect(kindsOf(ctx)).toEqual({ start: 36, fold: 12, headsup: 12 });
    expect(usePermissions.getState().budgetTrimmed).toBe(true);
    expect(ctx.pending().includes(SENTINEL_ID)).toBe(false);

    // The heads-ups kept are the soonest ones: nothing dropped fires before anything kept.
    const kept = ctx
      .pending()
      .map((id) => ctx.intent(id))
      .filter((i) => i.kind === 'headsup');
    const full = planNotifications(await inputFor(ctx, { budget: 10_000 })).intents.filter(
      (i) => i.kind === 'headsup',
    );
    const keptIds = new Set(kept.map((i) => i.id));
    const dropped = full.filter((i) => !keptIds.has(i.id));
    expect(full).toHaveLength(74);
    expect(dropped).toHaveLength(62);
    const lastKept = Math.max(...kept.map((i) => i.fireAtMs));
    for (const d of dropped) expect(d.fireAtMs).toBeGreaterThanOrEqual(lastKept);
  });

  it('both bakes stay represented and the pending set never exceeds the platform cap', async () => {
    const ctx = await twoBigBakes();
    expect(ctx.pending(ctx.a.bake.id).length).toBeGreaterThan(0);
    expect(ctx.pending(ctx.b.bake.id).length).toBeGreaterThan(0);
    expect(ctx.pending().length).toBeLessThanOrEqual(IOS_PENDING_CAP);
  });

  it('a foreground top-up after the first reminders fire pulls in the next heads-ups with no duplicates (T-IOS-CAP-4)', async () => {
    const ctx = await twoBigBakes();
    const before = ctx.fireTimes();
    const firing = [...before.values()].sort((x, y) => x - y);
    // Ten reminders have fired.
    ctx.clock.now = firing[9]! + 30_000;
    ctx.notifier.calls = { schedule: 0, cancel: 0, cancelAll: 0 };
    const result = await ctx.service.reconcile({ mode: 'diff' });
    const after = ctx.fireTimes();
    expect(result.status).toBe('ok');
    expect(after.size).toBeLessThanOrEqual(60);
    expect(new Set(ctx.pending()).size).toBe(ctx.pending().length);
    for (const t of after.values()) expect(t).toBeGreaterThan(ctx.clock.now);
    // Ones that were already pending and still future were not rescheduled.
    expect(ctx.notifier.calls.schedule).toBe(
      [...after.keys()].filter((id) => !before.has(id)).length,
    );
    // The slots freed by the fired reminders were refilled (the later heads-ups moved in).
    expect(after.size).toBeGreaterThan(50);
  });

  it('finishing one bake frees its slots for the other bake (T-IOS-CAP-6, -7)', async () => {
    const ctx = await twoBigBakes();
    const bBefore = ctx.pending(ctx.b.bake.id).length;
    await ctx.bakeService.cancel(ctx.a.bake.id, NOW);
    expect(ctx.pending(ctx.a.bake.id)).toEqual([]);
    // Bake B alone is 60 reminders; it was trimmed before, now it gets its heads-ups back.
    expect(ctx.pending(ctx.b.bake.id).length).toBeGreaterThan(bBefore);
    expect(ctx.pending().length).toBeLessThanOrEqual(60);
  });

  it('two ordinary bakes never need trimming (T-IOS-CAP-2)', async () => {
    const ctx = await setup();
    await makeBake(ctx.db, { service: ctx.bakeService });
    await makeBake(ctx.db, {
      service: ctx.bakeService,
      recipes: [{ id: WHOLE_WHEAT }],
      ready: { date: '2026-11-28', time: '12:00' },
    });
    expect(ctx.pending()).toHaveLength(46);
    expect(usePermissions.getState().budgetTrimmed).toBe(false);
  });
});

describe('overflowing the critical budget adds one top-up sentinel (T-IOS-CAP-3, -5)', () => {
  async function overflow() {
    const ctx = await setup();
    for (const [i, tag] of ['a', 'b'].entries()) {
      await makeBake(ctx.db, {
        service: ctx.bakeService,
        recipes: FOUR,
        ovenCapacity: 2,
        itemTag: tag,
        ready: { date: '2026-11-28', time: i === 0 ? '10:00' : '14:00' },
      });
    }
    await makeBake(ctx.db, { service: ctx.bakeService, itemTag: 'c' });
    await makeBake(ctx.db, {
      service: ctx.bakeService,
      recipes: [{ id: WHOLE_WHEAT }],
      itemTag: 'd',
      ready: { date: '2026-11-28', time: '12:00' },
    });
    return ctx;
  }

  it('keeps the soonest 59 starts and folds, drops the rest and fires one sentinel just before the first dropped one', async () => {
    const ctx = await overflow();
    const result = await ctx.service.reconcile({ mode: 'diff' });
    expect(result.trimmed.critical).toBeGreaterThan(0);
    expect(ctx.pending().filter((id) => id === SENTINEL_ID)).toHaveLength(1);
    const critical = ctx
      .pending()
      .map((id) => ctx.intent(id))
      .filter((i) => i.kind === 'start' || i.kind === 'fold');
    expect(critical).toHaveLength(59);
    const full = planNotifications(await inputFor(ctx, { budget: 10_000 })).intents.filter(
      (i) => i.kind === 'start' || i.kind === 'fold',
    );
    const keptIds = new Set(critical.map((i) => i.id));
    const latestKept = Math.max(...critical.map((i) => i.fireAtMs));
    for (const dropped of full.filter((i) => !keptIds.has(i.id))) {
      expect(dropped.fireAtMs).toBeGreaterThanOrEqual(latestKept);
    }
    expect(ctx.intent(SENTINEL_ID).fireAtMs).toBe(latestKept - MIN);
    expect(ctx.intent(SENTINEL_ID).interruptionLevel).toBe('active');
    expect(ctx.pending().length).toBeLessThanOrEqual(IOS_PENDING_CAP);
  });

  it('opening the app later replaces the sentinel (same id) and keeps later reminders coming', async () => {
    const ctx = await overflow();
    const firstSentinel = ctx.intent(SENTINEL_ID).fireAtMs;
    ctx.clock.now = at('2026-11-27', '12:00');
    await ctx.service.reconcile({ mode: 'diff' });
    expect(ctx.pending().filter((id) => id === SENTINEL_ID)).toHaveLength(1);
    expect(ctx.intent(SENTINEL_ID).fireAtMs).toBeGreaterThan(firstSentinel);
    expect(new Set(ctx.pending()).size).toBe(ctx.pending().length);
  });

  // Fixed QA04-B1. ADR 0011 section 3 sets the iOS budget to 60 and the planner contract is
  // "intents.length <= budget", but with an overflow of starts/folds the selection takes
  // budget-1 criticals, then fills `budget - taken` = 1 slot with a heads-up, then adds the
  // sentinel on top: 61. Still under the hard 64 cap, so minor.
  it('never plans more than the 60-request budget when the sentinel is needed', async () => {
    const ctx = await overflow();
    expect(ctx.pending().length).toBeLessThanOrEqual(60);
  });

  it('is still under the hard 64 cap with the test reminder pending', async () => {
    const ctx = await overflow();
    expect(await ctx.service.scheduleTestReminder()).toBe(true);
    expect(ctx.notifier.store.size).toBeLessThanOrEqual(IOS_PENDING_CAP);
  });
});

describe('Android budget', () => {
  it('two 4-recipe bakes fit entirely under 150 with exact alarms', async () => {
    const ctx = await setup({ platform: 'android' });
    for (const [tag, time] of [
      ['a', '10:00'],
      ['b', '14:00'],
    ] as const) {
      await makeBake(ctx.db, {
        service: ctx.bakeService,
        recipes: FOUR,
        ovenCapacity: 2,
        itemTag: tag,
        ready: { date: '2026-11-28', time },
      });
    }
    expect(ctx.pending()).toHaveLength(36 + 12 + 74);
    expect(usePermissions.getState().budgetTrimmed).toBe(false);
  });
});

describe('DST nights keep absolute instants (ADR 0005, T-REB-8)', () => {
  const localTime = (ms: number) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: ZONE,
      hour: 'numeric',
      minute: '2-digit',
      hour12: false,
    }).format(ms);

  it.each([
    ['fall back, ready Sun 2026-11-01 10:00', '2026-11-01', '2026-10-28', Date.UTC(2026, 10, 1, 6)],
    [
      'spring forward, ready Sun 2026-03-08 10:00',
      '2026-03-08',
      '2026-03-04',
      Date.UTC(2026, 2, 8, 7),
    ],
  ])(
    '%s: reminders sit on the planned instants, 1:1 with the plan, and span the change',
    async (_n, readyDate, nowDate, change) => {
      const ctx = await setup({ now: at(nowDate, '09:00') });
      const bake = await makeBake(ctx.db, {
        service: ctx.bakeService,
        ready: { date: readyDate, time: '10:00' },
        now: at(nowDate, '09:00'),
      });
      const sequential = bake.steps.filter((s) => s.bakeItemId !== null && !s.isAlongside);
      // The bake really crosses the change: the cold ferment spans it.
      const first = fromIso(sequential[0]!.plannedStartAt);
      const last = fromIso(sequential.at(-1)!.plannedEndAt);
      expect(first).toBeLessThan(change);
      expect(last).toBeGreaterThan(change);
      // Ready time is 10:00 local on the far side of the change.
      expect(localTime(fromIso(bake.bake.plannedReadyAt))).toBe('10:00');

      const times = ctx.fireTimes();
      for (const step of bake.steps) {
        expect(times.get(`sa1:${bake.bake.id}:${step.stepKey}:start`)).toBe(
          fromIso(step.plannedStartAt),
        );
      }
      // Elapsed time, not wall time: back-to-back steps are exactly their duration apart.
      for (let i = 1; i < sequential.length; i += 1) {
        const prev = sequential[i - 1]!;
        expect(fromIso(sequential[i]!.plannedStartAt) - fromIso(prev.plannedStartAt)).toBe(
          prev.durationMin * MIN,
        );
      }
      expect(new Set(ctx.pending()).size).toBe(ctx.pending().length);
      expect(ctx.pending()).toHaveLength(23);
    },
  );

  it('the repeated 1:30 AM on 2026-11-01 fires twice, one hour apart, once each', () => {
    const early = Date.UTC(2026, 10, 1, 5, 30); // 1:30 AM EDT
    const late = Date.UTC(2026, 10, 1, 6, 30); // 1:30 AM EST
    const bake = makeSpecBake({
      steps: [
        { key: 'i:a', name: 'Feed', kind: 'feed', startMs: early, durationMin: 60 },
        { key: 'i:b', name: 'Mix', kind: 'mix', startMs: late, durationMin: 60 },
      ],
    });
    const { intents } = planNotifications({
      bakes: [bake],
      nowMs: early - 12 * HOUR,
      zone: ZONE,
      locale: 'en-US',
      platform: 'ios',
      exactAlarm: true,
      readyEnabled: false,
    });
    const starts = intents.filter((i) => i.kind === 'start');
    expect(starts.map((i) => i.fireAtMs)).toEqual([early, late]);
    expect(new Set(starts.map((i) => i.id)).size).toBe(2);
    expect(localTime(early)).toBe(localTime(late));
  });

  it('fold reminders across the repeated hour stay 30 min apart', () => {
    const start = Date.UTC(2026, 10, 1, 5, 45); // 1:45 AM EDT; folds at 1:15 EST, 1:45 EST, 2:15 EST
    const bake = makeSpecBake({
      steps: [
        {
          key: 'i:fold',
          name: 'Stretch and folds',
          kind: 'fold',
          startMs: start,
          durationMin: 120,
          folds: { count: 4, intervalMin: 30 },
        },
      ],
    });
    const { intents } = planNotifications({
      bakes: [bake],
      nowMs: start - 3 * HOUR,
      zone: ZONE,
      locale: 'en-US',
      platform: 'ios',
      exactAlarm: true,
      readyEnabled: false,
    });
    const folds = intents.filter((i) => i.kind === 'start' || i.kind === 'fold');
    expect(folds.map((i) => i.fireAtMs)).toEqual([0, 30, 60, 90].map((m) => start + m * MIN));
  });

  it('a step whose wall-clock time is skipped on 2026-03-08 still fires at its absolute instant', () => {
    const before = Date.UTC(2026, 2, 8, 6, 30); // 1:30 AM EST
    const after = Date.UTC(2026, 2, 8, 7, 30); // 3:30 AM EDT; 2:30 does not exist
    const bake = makeSpecBake({
      steps: [
        { key: 'i:a', name: 'Feed', kind: 'feed', startMs: before, durationMin: 60 },
        { key: 'i:b', name: 'Mix', kind: 'mix', startMs: after, durationMin: 60 },
      ],
    });
    const { intents } = planNotifications({
      bakes: [bake],
      nowMs: before - 12 * HOUR,
      zone: ZONE,
      locale: 'en-US',
      platform: 'ios',
      exactAlarm: true,
      readyEnabled: false,
    });
    const starts = intents.filter((i) => i.kind === 'start');
    expect(starts[1]!.fireAtMs - starts[0]!.fireAtMs).toBe(60 * MIN);
  });

  it('the device zone changing across the night does not move or duplicate anything', async () => {
    const ctx = await setup({ now: at('2026-10-28', '09:00') });
    await makeBake(ctx.db, {
      service: ctx.bakeService,
      ready: { date: '2026-11-01', time: '10:00' },
      now: at('2026-10-28', '09:00'),
    });
    const before = ctx.fireTimes();
    for (const zone of ['America/Los_Angeles', 'Pacific/Auckland', 'UTC']) {
      ctx.clock.zone = zone;
      await ctx.service.reconcile({ mode: 'diff' });
      expect(ctx.fireTimes()).toEqual(before);
    }
  });
});

/** The planner input the service builds, with an optional budget override. */
async function inputFor(ctx: Harness, over: Partial<PlannerInput> = {}): Promise<PlannerInput> {
  const headers = await ctx.db.repos.bakes.list({ statuses: ['scheduled', 'active'] });
  const bakes = await Promise.all(headers.map((b) => ctx.db.repos.bakes.get(b.id)));
  return {
    bakes: bakes.filter((b): b is NonNullable<typeof b> => b !== null),
    nowMs: ctx.clock.now,
    zone: ctx.clock.zone,
    locale: 'en-US',
    platform: ctx.notifier.platform,
    exactAlarm: true,
    readyEnabled: false,
    ...over,
  };
}
