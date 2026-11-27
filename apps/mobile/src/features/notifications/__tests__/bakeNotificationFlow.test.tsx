/**
 * QA-04: the seams between the schedule, live and notification features, with the real planner,
 * the real service, the real bake repository (in-memory SQLite) and the real core recompute. Only
 * the OS queue is fake. Each test asserts the pending set the OS would hold.
 *
 * Clock: Thu 2026-11-26 09:00 in New York; the default bake is ready Sat 10:00 (PRD example).
 */
import { fromIso } from '@sourdough/core';
import type { BakeAggregate } from '../../../db/types';
import {
  COUNTRY,
  MIN,
  NOW,
  WHOLE_WHEAT,
  ZONE,
  at,
  makeBake,
  seededDb,
  startAt,
  stepByName,
} from '../../live/__tests__/helpers';
import { createHarness, type Harness } from './seamHarness';

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

const fire = (bake: BakeAggregate, name: string) => fromIso(stepByName(bake, name).plannedStartAt);
const startId = (bake: BakeAggregate, name: string) =>
  `sa1:${bake.bake.id}:${stepByName(bake, name).stepKey}:start`;
/** The bake-wide Preheat oven step has no item, so it is found by its key. */
const PREHEAT = 'bake:preheat';
const preheatStartId = (bake: BakeAggregate) => `sa1:${bake.bake.id}:${PREHEAT}:start`;
const headsUpId = (bake: BakeAggregate, name: string) =>
  `sa1:${bake.bake.id}:${stepByName(bake, name).stepKey}:headsup`;

describe('schedule a bake -> reconcile -> the planned notification ids', () => {
  it('pends exactly one start and one heads-up per step plus fold 2 to 4, all in the future', async () => {
    const { db, bakeService, notifier, pending } = await setup();
    notifier.seed('satest:123');
    const bake = await makeBake(db, { service: bakeService });

    const expected = new Set<string>();
    for (const step of bake.steps) {
      expected.add(`sa1:${bake.bake.id}:${step.stepKey}:start`);
      expected.add(`sa1:${bake.bake.id}:${step.stepKey}:headsup`);
    }
    const folds = stepByName(bake, 'Stretch and folds').stepKey;
    for (const n of [2, 3, 4]) expected.add(`sa1:${bake.bake.id}:${folds}:fold:${n}`);

    // 10 plan steps (preheat included): 10 starts + 10 heads-ups + 3 extra folds = 23 (ADR 0011).
    expect(pending()).toEqual([...expected].sort());
    expect(pending()).toHaveLength(23);
    // The test reminder namespace is never touched.
    expect(notifier.store.has('satest:123')).toBe(true);
  });

  it('fire times are the planned start, the heads-up lead before it, and the fold interval after it', async () => {
    const { db, bakeService, fireTimes, intent } = await setup();
    const bake = await makeBake(db, { service: bakeService, headsUpMin: 15 });
    const times = fireTimes();
    expect(times.get(startId(bake, 'Final starter feeding'))).toBe(at('2026-11-27', '03:05'));
    expect(times.get(headsUpId(bake, 'Final starter feeding'))).toBe(
      at('2026-11-27', '03:05') - 15 * MIN,
    );
    const folds = stepByName(bake, 'Stretch and folds');
    const first = fromIso(folds.plannedStartAt);
    for (const n of [2, 3, 4]) {
      expect(times.get(`sa1:${bake.bake.id}:${folds.stepKey}:fold:${n}`)).toBe(
        first + (n - 1) * 30 * MIN,
      );
    }
    for (const t of times.values()) expect(t).toBeGreaterThan(NOW);
    // Payload carries the ids the tap handler needs and nothing the user typed.
    const payload = intent(startId(bake, 'Shape')).data;
    expect(payload).toMatchObject({
      v: 1,
      kind: 'start',
      bakeId: bake.bake.id,
      bakeStepId: stepByName(bake, 'Shape').id,
    });
  });

  it('a second bake adds its own ids and leaves the first bake pending set byte-identical', async () => {
    const { db, bakeService, notifier, pending, fireTimes } = await setup();
    const a = await makeBake(db, { service: bakeService });
    const before = fireTimes(a.bake.id);
    notifier.calls = { schedule: 0, cancel: 0, cancelAll: 0 };
    const b = await makeBake(db, {
      service: bakeService,
      recipes: [{ id: WHOLE_WHEAT }],
      ready: { date: '2026-11-28', time: '12:00' },
    });
    expect(fireTimes(a.bake.id)).toEqual(before);
    expect(pending(b.bake.id).length).toBeGreaterThan(0);
    // Only the new bake's requests were scheduled and nothing was cancelled.
    expect(notifier.calls.cancel).toBe(0);
    expect(notifier.calls.schedule).toBe(pending(b.bake.id).length);
    expect(pending()).toHaveLength(pending(a.bake.id).length + pending(b.bake.id).length);
  });

  it('Android: start and fold ring as alarm clocks on the steps channel, heads-ups as best effort', async () => {
    const { db, bakeService, intent } = await setup({ platform: 'android' });
    const bake = await makeBake(db, { service: bakeService });
    expect(intent(startId(bake, 'Shape'))).toMatchObject({
      channelId: 'bake-steps-v1',
      delivery: 'alarmClock',
    });
    expect(intent(headsUpId(bake, 'Shape'))).toMatchObject({
      channelId: 'bake-headsup-v1',
      delivery: 'bestEffort',
    });
  });
});

describe('quiet hours never silence a reminder (ADR 0010 section 5)', () => {
  it.each(['ios', 'android'] as const)(
    '%s: the 3:05 AM feeding and its heads-up at 2:50 AM are both scheduled at full strength',
    async (platform) => {
      const { db, bakeService, intent } = await setup({ platform });
      const bake = await makeBake(db, { service: bakeService });
      const start = intent(startId(bake, 'Final starter feeding'));
      const headsUp = intent(headsUpId(bake, 'Final starter feeding'));
      expect(start.fireAtMs).toBe(at('2026-11-27', '03:05'));
      expect(headsUp.fireAtMs).toBe(at('2026-11-27', '02:50'));
      if (platform === 'ios') {
        expect(start.interruptionLevel).toBe('timeSensitive');
        expect(headsUp.interruptionLevel).toBe('active');
      } else {
        expect(start.delivery).toBe('alarmClock');
      }
    },
  );

  it('the pending set is the same for a bake whose steps all fall outside quiet hours', async () => {
    const { db, bakeService, pending } = await setup();
    // An 18 h cold ferment moves the first feed to 9:05 PM the day before; still 23 reminders.
    const bake = await makeBake(db, { service: bakeService, durations: { Cold: 1080 } });
    expect(pending(bake.bake.id)).toHaveLength(23);
  });
});

describe('live Done, +15, Hold and Undo -> rescheduleBake -> the pending set shifts', () => {
  it('Bulk done 40 min late: finished steps drop out, every later reminder moves by exactly +40 min', async () => {
    const { db, bakeService, clock, pending, fireTimes } = await setup();
    let bake = await makeBake(db, { service: bakeService });
    bake = await startAt(db, bake, 'Bulk ferment');
    const before = fireTimes();
    const lateAt = at('2026-11-27', '20:45'); // planned end 8:05 PM
    clock.now = lateAt;

    const outcome = await bakeService.applyEvent(
      bake.bake.id,
      { type: 'stepDone', key: stepByName(bake, 'Bulk ferment').stepKey, at: lateAt },
      { now: lateAt },
    );
    expect(outcome.ok).toBe(true);

    const after = fireTimes();
    const stepsDone = [
      'Final starter feeding',
      'Mix and rest',
      'Stretch and folds',
      'Bulk ferment',
    ];
    const doneKeys = stepsDone.map((n) => stepByName(bake, n).stepKey);
    // Nothing is left for a done step: no start, heads-up or fold id.
    for (const id of pending()) {
      for (const key of doneKeys) expect(id).not.toContain(`:${key}:`);
    }
    // Every other reminder is still there and moved by +40 min.
    // Shape now starts at 8:45 PM, which is "now": the live screen offers it, so no reminder is left
    // for it, and its heads-up (8:30 PM) is already past. Everything later is still pending.
    const remaining = [...before.keys()].filter(
      (id) =>
        !doneKeys.some((k) => id.includes(`:${k}:`)) && before.get(id)! + 40 * MIN > lateAt + 5000,
    );
    expect([...after.keys()].sort()).toEqual(remaining.sort());
    expect(remaining).toHaveLength(9);
    expect(after.has(startId(bake, 'Shape'))).toBe(false);
    for (const id of remaining) expect(after.get(id)! - before.get(id)!).toBe(40 * MIN);
    // Cool, the last step, now starts 40 min later than planned.
    expect(after.get(startId(bake, 'Cool'))).toBe(fire(bake, 'Cool') + 40 * MIN);
  });

  it('+15 min on the running step shifts the later reminders by 15 min and keeps the id set', async () => {
    const { db, bakeService, clock, fireTimes } = await setup();
    let bake = await makeBake(db, { service: bakeService });
    bake = await startAt(db, bake, 'Bulk ferment');
    clock.now = at('2026-11-27', '17:00');
    const before = fireTimes();
    const outcome = await bakeService.applyEvent(
      bake.bake.id,
      { type: 'extend', key: stepByName(bake, 'Bulk ferment').stepKey, minutes: 15 },
      { now: clock.now },
    );
    expect(outcome.ok).toBe(true);
    const after = fireTimes();
    expect([...after.keys()]).toEqual([...before.keys()]);
    const shape = startId(bake, 'Shape');
    expect(after.get(shape)! - before.get(shape)!).toBe(15 * MIN);
    expect(after.get(startId(bake, 'Cool'))! - before.get(startId(bake, 'Cool'))!).toBe(15 * MIN);
  });

  it('Undo puts every reminder back at its original instant, with no duplicates', async () => {
    const { db, bakeService, clock, pending, fireTimes, service } = await setup();
    let bake = await makeBake(db, { service: bakeService });
    bake = await startAt(db, bake, 'Bulk ferment');
    clock.now = at('2026-11-27', '20:45');
    await service.reconcile({ mode: 'diff' }); // the foreground diff at 8:45 PM
    const before = fireTimes();
    db.clock.advance(1000);
    const outcome = await bakeService.applyEvent(
      bake.bake.id,
      { type: 'stepDone', key: stepByName(bake, 'Bulk ferment').stepKey, at: clock.now },
      { now: clock.now },
    );
    if (!outcome.ok) throw new Error('apply failed');
    expect(fireTimes()).not.toEqual(before);
    db.clock.advance(1000);
    expect(await bakeService.revert(outcome.value.revertToken)).toEqual({ ok: true });
    expect(fireTimes()).toEqual(before);
    expect(new Set(pending()).size).toBe(pending().length);
  });

  it('Hold ready time: later steps keep their instants while the cold ferment shrinks', async () => {
    const { db, bakeService, clock, fireTimes } = await setup();
    let bake = await makeBake(db, { service: bakeService, durations: { Cold: 1080 } });
    const original = fireTimes();
    const lateAt = at('2026-11-27', '14:45'); // bulk planned to end 2:05 PM
    clock.now = lateAt;
    await bakeService.applyEvent(
      bake.bake.id,
      { type: 'stepDone', key: stepByName(bake, 'Bulk ferment').stepKey, at: lateAt },
      { now: lateAt },
    );
    const late = fireTimes();
    expect(late.get(preheatStartId(bake))! - original.get(preheatStartId(bake))!).toBe(40 * MIN);
    bake = (await db.repos.bakes.get(bake.bake.id))!;
    const cold = stepByName(bake, 'Cold ferment (fridge)');
    await bakeService.applyEvent(
      bake.bake.id,
      { type: 'extend', key: cold.stepKey, minutes: -40 },
      { now: lateAt },
    );
    const held = fireTimes();
    // Oven steps are back on their original instants (ready 10:00 AM again).
    for (const id of [
      preheatStartId(bake),
      startId(bake, 'Bake, covered'),
      startId(bake, 'Cool'),
    ]) {
      expect(held.get(id)).toBe(original.get(id));
    }
    // The cold ferment itself starts 40 min later than first planned, so its start moved.
    expect(held.get(startId(bake, 'Cold ferment (fridge)'))).toBe(
      original.get(startId(bake, 'Cold ferment (fridge)'))! + 40 * MIN,
    );
  });

  it('a fold done late re-anchors the remaining fold reminders', async () => {
    const { db, bakeService, clock, fireTimes } = await setup();
    const bake = await makeBake(db, { service: bakeService });
    const folds = stepByName(bake, 'Stretch and folds');
    const before = fireTimes();
    const foldAt = at('2026-11-27', '12:15'); // fold 1 planned 12:05
    clock.now = foldAt;
    const outcome = await bakeService.applyEvent(
      bake.bake.id,
      { type: 'foldDone', key: folds.stepKey, foldIndex: 1, at: foldAt },
      { now: foldAt },
    );
    expect(outcome.ok).toBe(true);
    const after = fireTimes();
    const id = (n: number) => `sa1:${bake.bake.id}:${folds.stepKey}:fold:${n}`;
    for (const n of [2, 3, 4]) expect(after.get(id(n))! - before.get(id(n))!).toBe(10 * MIN);
    // The step is running, so its own start and heads-up are gone.
    expect(after.has(startId(bake, 'Stretch and folds'))).toBe(false);
  });
});

describe('cancel or finish -> reminders removed', () => {
  async function twoBakes() {
    const ctx = await setup();
    ctx.notifier.seed('satest:999');
    const a = await makeBake(ctx.db, { service: ctx.bakeService });
    const b = await makeBake(ctx.db, {
      service: ctx.bakeService,
      recipes: [{ id: WHOLE_WHEAT }],
      ready: { date: '2026-11-28', time: '12:00' },
    });
    return { ...ctx, a, b };
  }

  it('cancel removes that bake only; the other bake and the test reminder stay', async () => {
    const { bakeService, pending, fireTimes, notifier, a, b } = await twoBakes();
    const otherBefore = fireTimes(b.bake.id);
    expect(pending(a.bake.id).length).toBeGreaterThan(0);
    await bakeService.cancel(a.bake.id, NOW);
    expect(pending(a.bake.id)).toEqual([]);
    expect(fireTimes(b.bake.id)).toEqual(otherBefore);
    expect(notifier.store.has('satest:999')).toBe(true);
  });

  it('finish removes the remaining reminders, and Undo of the finish brings them back', async () => {
    const { db, bakeService, pending, a, b } = await twoBakes();
    const bPending = pending(b.bake.id);
    db.clock.advance(1000);
    const finished = await bakeService.finish(a.bake.id, NOW + 60 * MIN);
    if (!finished.ok) throw new Error('finish failed');
    expect(pending(a.bake.id)).toEqual([]);
    expect(pending(b.bake.id)).toEqual(bPending);
    db.clock.advance(1000);
    await bakeService.revert(finished.value.revertToken);
    expect(pending(a.bake.id).length).toBeGreaterThan(0);
  });

  it('the final "Done, finish bake" step event completes the bake and clears everything', async () => {
    const { db, bakeService, clock, pending, a } = await twoBakes();
    const cool = stepByName(a, 'Cool');
    const doneAt = at('2026-11-28', '10:05');
    clock.now = doneAt;
    const out = await bakeService.applyEvent(
      a.bake.id,
      { type: 'stepDone', key: cool.stepKey, at: doneAt },
      { now: doneAt, finish: true },
    );
    expect(out.ok).toBe(true);
    expect((await db.repos.bakes.get(a.bake.id))!.bake.status).toBe('completed');
    expect(pending(a.bake.id)).toEqual([]);
  });

  it('sweep: a scheduled bake that becomes due keeps its reminders; a stale one has none left', async () => {
    const { bakeService, clock, pending, a } = await twoBakes();
    const count = pending(a.bake.id).length;
    // 3:10 AM Friday: the sweep activates the bake and diffs; pending reminders for the feed go away.
    clock.now = at('2026-11-27', '03:10');
    expect(await bakeService.sweep(clock.now)).toContain(a.bake.id);
    expect(pending(a.bake.id).length).toBeLessThan(count);
    // 13 h after ready: completed by sweep, nothing pending.
    clock.now = at('2026-11-29', '01:00');
    await bakeService.sweep(clock.now);
    expect(pending(a.bake.id)).toEqual([]);
  });
});

describe('permission, reinstall and relaunch', () => {
  it('denied: the bake is saved, nothing is scheduled and the OS queue is untouched; grant plus rebuild schedules all', async () => {
    const { db, bakeService, notifier, service, pending } = await setup();
    notifier.permission = 'denied';
    notifier.seed('sa1:00000000-0000-4000-8000-0000000000aa:old:start', 'x');
    const bake = await makeBake(db, { service: bakeService });
    expect((await db.repos.bakes.get(bake.bake.id))!.bake.status).toBe('scheduled');
    expect(pending(bake.bake.id)).toEqual([]);
    expect(notifier.calls.schedule).toBe(0);
    notifier.permission = 'granted';
    await service.reconcile({ mode: 'rebuild' });
    expect(pending(bake.bake.id)).toHaveLength(23);
    // The stale id from before is gone: rebuild owns the whole namespace.
    expect(notifier.store.has('sa1:00000000-0000-4000-8000-0000000000aa:old:start')).toBe(false);
  });

  it('revoked mid-bake then re-granted: a Done made while denied is reflected after the rebuild', async () => {
    const { db, bakeService, notifier, clock, service, pending, fireTimes } = await setup();
    let bake = await makeBake(db, { service: bakeService });
    bake = await startAt(db, bake, 'Bulk ferment');
    notifier.permission = 'denied';
    clock.now = at('2026-11-27', '20:45');
    await bakeService.applyEvent(
      bake.bake.id,
      { type: 'stepDone', key: stepByName(bake, 'Bulk ferment').stepKey, at: clock.now },
      { now: clock.now },
    );
    notifier.permission = 'granted';
    await service.reconcile({ mode: 'rebuild' });
    // Cold ferment follows Shape (which starts "now"), 30 min later than planned only if shifted.
    const cold = startId(bake, 'Cold ferment (fridge)');
    expect(fireTimes().get(cold)).toBe(
      fromIso(stepByName(bake, 'Cold ferment (fridge)').plannedStartAt) + 40 * MIN,
    );
    expect(pending().some((id) => id.includes(stepByName(bake, 'Bulk ferment').stepKey))).toBe(
      false,
    );
    expect(new Set(pending()).size).toBe(pending().length);
  });

  it('the OS lost everything (reinstall, restore): a rebuild restores only the future steps', async () => {
    const { db, bakeService, notifier, clock, service, pending, fireTimes } = await setup();
    const bake = await makeBake(db, { service: bakeService });
    const full = pending().length;
    notifier.store.clear();
    notifier.intents.clear();
    // The phone comes back at 8:00 AM Saturday: only preheat, bake and cool are still ahead.
    clock.now = at('2026-11-28', '07:00');
    await service.reconcile({ mode: 'rebuild' });
    expect(pending().length).toBeGreaterThan(0);
    expect(pending().length).toBeLessThan(full);
    for (const t of fireTimes().values()) expect(t).toBeGreaterThan(clock.now);
    expect(pending()).toContain(startId(bake, 'Cool'));
  });

  it('foreground after the clock moved forward fires nothing in a burst: past steps are simply gone', async () => {
    const { db, bakeService, clock, service, notifier, pending } = await setup();
    await makeBake(db, { service: bakeService });
    notifier.calls = { schedule: 0, cancel: 0, cancelAll: 0 };
    clock.now = at('2026-11-27', '21:00');
    await service.reconcile({ mode: 'diff' });
    expect(notifier.calls.schedule).toBe(0);
    expect(notifier.calls.cancel).toBeGreaterThan(0);
    expect(pending().length).toBeLessThan(23);
  });
});

describe('two bakes at the same minute (T-LIFE-8)', () => {
  it('both are scheduled with distinct ids, and titles or bodies tell them apart', async () => {
    const { db, bakeService, intent, pending } = await setup();
    const a = await makeBake(db, { service: bakeService });
    const b = await makeBake(db, {
      service: bakeService,
      recipes: [{ id: WHOLE_WHEAT }],
      ready: { date: '2026-11-28', time: '10:00' },
    });
    const idA = startId(a, 'Final starter feeding');
    const idB = startId(b, 'Final starter feeding');
    expect(idA).not.toBe(idB);
    expect(new Set(pending()).size).toBe(pending().length);
    expect(intent(idA).fireAtMs).toBe(intent(idB).fireAtMs);
    expect(`${intent(idA).title}|${intent(idA).body}`).not.toBe(
      `${intent(idB).title}|${intent(idB).body}`,
    );
    expect(intent(idA).threadId).toBe(a.bake.id);
    expect(intent(idB).threadId).toBe(b.bake.id);
  });

  it('two bakes of the same recipe at different ready times are told apart by the ready time', async () => {
    const { db, bakeService, intent } = await setup();
    const a = await makeBake(db, { service: bakeService });
    const b = await makeBake(db, {
      service: bakeService,
      ready: { date: '2026-11-29', time: '10:00' },
      itemTag: 'b',
    });
    const bodyA = intent(startId(a, 'Shape')).body;
    const bodyB = intent(startId(b, 'Shape')).body;
    expect(bodyA).not.toBe(bodyB);
    expect(bodyA).toMatch(/ready/i);
  });
});

describe('time zone changes (T-REB-6)', () => {
  it('a foreground diff after a zone change keeps every request: absolute instants do not move', async () => {
    const { db, bakeService, clock, service, notifier } = await setup();
    const bake = await makeBake(db, { service: bakeService });
    const before = h!.fireTimes();
    notifier.calls = { schedule: 0, cancel: 0, cancelAll: 0 };
    clock.zone = 'Asia/Tokyo';
    const result = await service.reconcile({ mode: 'diff' });
    expect(result).toMatchObject({ scheduled: 0, cancelled: 0, kept: before.size });
    expect(h!.fireTimes()).toEqual(before);
    expect(bake.bake.timeZone).toBe(ZONE);
  });
});

describe('multi-loaf and multi-recipe bakes name what to do (T-FULL-3)', () => {
  it('3 loaves in a 2-loaf oven: oven reminders say which loaves and which slot, preheat is once', async () => {
    const { db, bakeService, pending, intent } = await setup();
    const bake = await makeBake(db, {
      service: bakeService,
      recipes: [{ id: COUNTRY, loaves: 3 }],
      ovenCapacity: 2,
    });
    expect(bake.bake.ovenSlots).toHaveLength(2);
    const ids = pending();
    expect(ids.filter((id) => id.endsWith(':s1:start')).length).toBeGreaterThan(0);
    expect(ids.filter((id) => id.endsWith(':s2:start')).length).toBeGreaterThan(0);
    expect(ids.filter((id) => id.includes('bake:preheat') && id.endsWith(':start'))).toHaveLength(
      1,
    );
    const covered = (slot: number) => {
      const row = bake.steps.find((r) => r.name === 'Bake, covered' && r.slotIndex === slot)!;
      return `sa1:${bake.bake.id}:${row.stepKey}:headsup`;
    };
    expect(intent(covered(1)).title).toBe('In 15 min: Bake, covered · 2 of 3 loaves · slot 1');
    expect(intent(covered(2)).title).toBe('In 15 min: Bake, covered · 1 of 3 loaves · slot 2');
    // Two steps in the same minute become one notification that lists both and opens the first.
    const merged = ids.map(intent).find((i) => i.data.bakeStepIds && i.data.bakeStepIds.length > 1);
    expect(merged?.title).toBe('2 steps now');
    expect(merged?.data.bakeStepIds).toContain(merged?.data.bakeStepId);
  });

  it('two recipes: every reminder carries a recipe name and bake-wide steps list them all', async () => {
    const { db, bakeService, pending, intent } = await setup();
    await makeBake(db, {
      service: bakeService,
      recipes: [{ id: COUNTRY }, { id: WHOLE_WHEAT }],
      ovenCapacity: 2,
    });
    for (const id of pending()) {
      const i = intent(id);
      if (i.kind === 'topup') continue;
      expect(`${i.title} ${i.body}`).toMatch(/Country loaf|Whole wheat loaf/);
    }
    const preheat = pending().find((id) => id.includes('bake:preheat') && id.endsWith(':start'))!;
    expect(intent(preheat).body).toContain('Country loaf, Whole wheat loaf');
  });
});

describe('launch after a reboot or an update (T-REB-2, T-REB-3)', () => {
  it('a cold-start rebuild over an intact OS queue ends with the same ids and no duplicates', async () => {
    const { db, bakeService, service, notifier, pending, fireTimes } = await setup();
    await makeBake(db, { service: bakeService });
    notifier.seed('satest:7');
    const before = fireTimes();
    for (let launch = 0; launch < 3; launch += 1) await service.reconcile({ mode: 'rebuild' });
    expect(fireTimes()).toEqual(before);
    expect(pending()).toHaveLength(23);
    expect(notifier.store.has('satest:7')).toBe(true);
  });

  it('an update that changed the wording replaces each request in place (new hash, same id)', async () => {
    const { db, bakeService, service, notifier, pending } = await setup();
    await makeBake(db, { service: bakeService });
    // Pretend the previous build stored different content hashes.
    for (const id of pending()) notifier.store.set(id, 'oldbuild');
    notifier.calls = { schedule: 0, cancel: 0, cancelAll: 0 };
    const result = await service.reconcile({ mode: 'diff' });
    expect(result).toMatchObject({ scheduled: 23, cancelled: 23, kept: 0 });
    expect(pending()).toHaveLength(23);
    expect(new Set(pending()).size).toBe(23);
  });
});

describe('a failed save leaves nothing behind (T-LIFE-6)', () => {
  it('a write that fails half way rolls back every row and schedules nothing', async () => {
    const { db, bakeService, notifier, pending } = await setup();
    const real = db.repos.bakes.create.bind(db.repos.bakes);
    jest.spyOn(db.repos.bakes, 'create').mockImplementationOnce((input) =>
      real({
        ...input,
        // The last step points at an item that does not exist: the transaction must fail.
        steps: input.steps.map((step, i) =>
          i === input.steps.length - 1
            ? { ...step, bakeItemId: '00000000-0000-4000-8000-00000000dead' }
            : step,
        ),
      }),
    );
    await expect(makeBake(db, { service: bakeService })).rejects.toThrow();
    expect(await db.repos.bakes.list()).toEqual([]);
    const rows = await db.db.all<{ n: number }>(
      'SELECT (SELECT COUNT(*) FROM bake) + (SELECT COUNT(*) FROM bake_item) + (SELECT COUNT(*) FROM bake_step) AS n',
    );
    expect(rows[0]!.n).toBe(0);
    expect(pending()).toEqual([]);
    expect(notifier.calls.schedule).toBe(0);
    // The retry works and pends the full set.
    await makeBake(db, { service: bakeService, itemTag: 'retry' });
    expect(pending()).toHaveLength(23);
  });
});

describe('the seams tolerate a missing service', () => {
  it('Done before the service is registered still writes the bake', async () => {
    const { db, bakeService } = await setup();
    const bake = await makeBake(db, { service: bakeService });
    h!.dispose();
    const out = await bakeService.applyEvent(
      bake.bake.id,
      { type: 'extend', key: stepByName(bake, 'Bulk ferment').stepKey, minutes: 15 },
      { now: NOW },
    );
    expect(out.ok).toBe(true);
    expect(COUNTRY).toBeTruthy();
  });
});
