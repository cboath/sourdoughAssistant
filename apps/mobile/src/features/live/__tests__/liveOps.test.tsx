/** RN-08: live writes over an in-memory database: recompute, undo, bounds, sweep, finish, cancel. */
import { fromIso, holdCapacity } from '@sourdough/core';
import { toBakePlan } from '../plan';
import { createBakeService, type BakeService } from '../../schedule/services/bakeService';
import { setLiveSideEffects } from '../sideEffects';
import { STALE_AFTER_MS } from '../services/liveOps';
import { MIN, WHOLE_WHEAT, at, makeBake, seededDb, stepByName, NOW } from './helpers';
import type { TestDb } from '../../../db/test-utils';

jest.setTimeout(30_000);

const FRI_2045 = at('2026-11-27', '20:45');

async function setup() {
  const db = await seededDb();
  const changes: string[] = [];
  const service: BakeService = createBakeService(db.repos, () => {
    changes.push('changed');
  });
  const seen: Array<[string, string]> = [];
  setLiveSideEffects({ onBakeProgressChanged: (id, reason) => void seen.push([id, reason]) });
  return { db, service, seen, changes };
}

afterEach(() => setLiveSideEffects(null));

const reload = async (db: TestDb, id: string) => (await db.repos.bakes.get(id))!;

describe('applyEvent: pure shift (B4)', () => {
  it('Bulk done 40 min late moves every later step and the ready time by 40 min', async () => {
    const { db, service, seen } = await setup();
    const bake = await makeBake(db);
    const bulk = stepByName(bake, 'Bulk ferment');
    db.clock.set(new Date(FRI_2045).toISOString());

    const outcome = await service.applyEvent(
      bake.bake.id,
      { type: 'stepDone', key: bulk.stepKey, at: FRI_2045 },
      { now: FRI_2045 },
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.result.deltaMin).toBe(40);

    const after = await reload(db, bake.bake.id);
    expect(after.bake.plannedReadyAt).toBe('2026-11-28T15:40:00.000Z');
    expect(after.bake.status).toBe('active');
    expect(after.bake.startedAt).not.toBeNull();
    const done = stepByName(after, 'Bulk ferment');
    expect(done).toMatchObject({ status: 'done', actualEndAt: new Date(FRI_2045).toISOString() });
    // Everything inferred before it is done without times.
    expect(stepByName(after, 'Mix and rest')).toMatchObject({
      status: 'done',
      inferredDone: true,
      actualEndAt: null,
    });
    const shape = stepByName(after, 'Shape');
    expect(shape.plannedStartAt).toBe(new Date(FRI_2045).toISOString());
    expect(fromIso(stepByName(after, 'Cool').plannedEndAt)).toBe(
      fromIso('2026-11-28T15:40:00.000Z'),
    );
    // The first plan stays on record.
    expect(shape.originalPlannedStartAt).toBe('2026-11-28T01:05:00.000Z');
    expect(after.bake.originalReadyAt).toBe('2026-11-28T15:00:00.000Z');
    expect(seen).toEqual([[bake.bake.id, 'event']]);
  });

  it('undo restores the rows exactly, then a second undo is stale', async () => {
    const { db, service, seen } = await setup();
    const bake = await makeBake(db);
    const before = await reload(db, bake.bake.id);
    const bulk = stepByName(bake, 'Bulk ferment');
    db.clock.advance(1000);
    const outcome = await service.applyEvent(
      bake.bake.id,
      { type: 'stepDone', key: bulk.stepKey, at: FRI_2045 },
      { now: FRI_2045 },
    );
    if (!outcome.ok) throw new Error('apply failed');
    db.clock.advance(1000);
    expect(await service.revert(outcome.value.revertToken)).toEqual({ ok: true });
    const restored = await reload(db, bake.bake.id);
    expect(restored.bake).toMatchObject({
      status: 'scheduled',
      plannedReadyAt: before.bake.plannedReadyAt,
      startedAt: null,
    });
    expect(restored.bake.ovenSlots).toEqual(before.bake.ovenSlots);
    for (const row of before.steps) {
      const now = restored.steps.find((s) => s.id === row.id)!;
      expect(now).toMatchObject({
        status: row.status,
        inferredDone: row.inferredDone,
        plannedStartAt: row.plannedStartAt,
        plannedEndAt: row.plannedEndAt,
        actualEndAt: row.actualEndAt,
        durationMin: row.durationMin,
      });
    }
    expect(seen.map((s) => s[1])).toEqual(['event', 'revert']);
    // The token is spent: the latest write is the revert itself.
    expect(await service.revert(outcome.value.revertToken)).toEqual({ ok: false, reason: 'stale' });
  });

  it('only the latest event can be undone', async () => {
    const { db, service } = await setup();
    const bake = await makeBake(db);
    const mix = stepByName(bake, 'Mix and rest');
    const bulk = stepByName(bake, 'Bulk ferment');
    db.clock.advance(1000);
    const first = await service.applyEvent(
      bake.bake.id,
      { type: 'extend', key: bulk.stepKey, minutes: 15 },
      { now: NOW },
    );
    db.clock.advance(1000);
    const second = await service.applyEvent(
      bake.bake.id,
      { type: 'extend', key: mix.stepKey, minutes: 15 },
      { now: NOW },
    );
    if (!first.ok || !second.ok) throw new Error('apply failed');
    expect(await service.revert(first.value.revertToken)).toEqual({ ok: false, reason: 'stale' });
    expect(await service.revert(second.value.revertToken)).toEqual({ ok: true });
  });

  it('+15 min on the current step shifts the ready time', async () => {
    const { db, service } = await setup();
    const bake = await makeBake(db);
    const bulk = stepByName(bake, 'Bulk ferment');
    const outcome = await service.applyEvent(
      bake.bake.id,
      { type: 'extend', key: bulk.stepKey, minutes: 15 },
      { now: NOW },
    );
    if (!outcome.ok) throw new Error('apply failed');
    expect(outcome.value.result.deltaMin).toBe(15);
    const after = await reload(db, bake.bake.id);
    expect(after.bake.plannedReadyAt).toBe('2026-11-28T15:15:00.000Z');
    expect(stepByName(after, 'Bulk ferment').durationMin).toBe(375);
    // Extending is not starting: the bake stays scheduled.
    expect(after.bake.status).toBe('scheduled');
  });

  it('Hold ready time: shortening the cold ferment by the delay keeps 10:00 AM', async () => {
    const { db, service } = await setup();
    const bake = await makeBake(db, { durations: { Cold: 1080 } });
    const bulk = stepByName(bake, 'Bulk ferment');
    // With an 18 h cold ferment the bulk ends at 2:05 PM; done at 2:45 PM is 40 min late.
    const lateAt = at('2026-11-27', '14:45');
    await service.applyEvent(
      bake.bake.id,
      { type: 'stepDone', key: bulk.stepKey, at: lateAt },
      { now: lateAt },
    );
    const late = await reload(db, bake.bake.id);
    expect(late.bake.plannedReadyAt).toBe('2026-11-28T15:40:00.000Z');

    const { plan } = toBakePlan(late);
    const capacity = holdCapacity(plan, late.items[0]!.id);
    expect(capacity).toMatchObject({ canAbsorbLateMin: 360, canAbsorbEarlyMin: 360 });
    const held = await service.applyEvent(
      bake.bake.id,
      { type: 'extend', key: capacity!.holdKey, minutes: -40 },
      { now: lateAt },
    );
    if (!held.ok) throw new Error('hold failed');
    const after = await reload(db, bake.bake.id);
    expect(after.bake.plannedReadyAt).toBe('2026-11-28T15:00:00.000Z');
    expect(stepByName(after, 'Cold ferment (fridge)').durationMin).toBe(1040);
  });

  it('Fold done re-anchors the remaining folds and the step end', async () => {
    const { db, service } = await setup();
    const bake = await makeBake(db);
    const folds = stepByName(bake, 'Stretch and folds');
    const foldAt = at('2026-11-27', '12:15'); // fold 1 planned 12:05, done 10 min late
    const outcome = await service.applyEvent(
      bake.bake.id,
      { type: 'foldDone', key: folds.stepKey, foldIndex: 1, at: foldAt },
      { now: foldAt },
    );
    if (!outcome.ok) throw new Error('apply failed');
    const after = await reload(db, bake.bake.id);
    const row = stepByName(after, 'Stretch and folds');
    expect(row).toMatchObject({
      status: 'active',
      foldsDone: 1,
      foldTimes: [new Date(foldAt).toISOString()],
    });
    // Four folds, 30 min apart: the step now ends one interval after fold 4 at 12:15 + 3 x 30 = 13:45, so 14:15.
    expect(row.plannedEndAt).toBe(new Date(at('2026-11-27', '14:15')).toISOString());
    expect(outcome.value.result.deltaMin).toBe(10);
  });
});

describe('applyEvent: bounds and errors', () => {
  it('refuses a time in the future, and one before the step started', async () => {
    const { db, service } = await setup();
    const bake = await makeBake(db);
    const bulk = stepByName(bake, 'Bulk ferment');
    const now = at('2026-11-27', '20:00');
    expect(
      await service.applyEvent(
        bake.bake.id,
        { type: 'stepDone', key: bulk.stepKey, at: now + MIN },
        { now },
      ),
    ).toEqual({ ok: false, error: { code: 'timeInFuture' } });
    const early = await service.applyEvent(
      bake.bake.id,
      { type: 'stepDone', key: bulk.stepKey, at: at('2026-11-27', '13:00') },
      { now },
    );
    expect(early).toEqual({
      ok: false,
      error: { code: 'beforeStart', minAt: at('2026-11-27', '14:05') },
    });
    expect((await reload(db, bake.bake.id)).bake.plannedReadyAt).toBe('2026-11-28T15:00:00.000Z');
  });

  it('marking a later step done now is allowed even though it has not started yet', async () => {
    const { db, service } = await setup();
    const bake = await makeBake(db);
    const shape = stepByName(bake, 'Shape');
    const now = at('2026-11-27', '15:00');
    const outcome = await service.applyEvent(
      bake.bake.id,
      { type: 'stepDone', key: shape.stepKey, at: now },
      { now },
    );
    expect(outcome.ok).toBe(true);
  });

  it('a started time cannot precede the previous step actual end', async () => {
    const { db, service } = await setup();
    const bake = await makeBake(db);
    const feed = stepByName(bake, 'Final starter feeding');
    const mix = stepByName(bake, 'Mix and rest');
    const now = at('2026-11-27', '12:00');
    const done = await service.applyEvent(
      bake.bake.id,
      { type: 'stepDone', key: feed.stepKey, at: at('2026-11-27', '11:00') },
      { now },
    );
    expect(done.ok).toBe(true);
    const early = await service.applyEvent(
      bake.bake.id,
      { type: 'stepStarted', key: mix.stepKey, at: at('2026-11-27', '10:00') },
      { now },
    );
    expect(early).toEqual({
      ok: false,
      error: { code: 'beforePrevious', minAt: at('2026-11-27', '11:00') },
    });
  });

  it('unknown steps, done steps and closed bakes return typed errors', async () => {
    const { db, service } = await setup();
    const bake = await makeBake(db);
    const feed = stepByName(bake, 'Final starter feeding');
    const now = at('2026-11-27', '12:00');
    expect(
      await service.applyEvent(bake.bake.id, { type: 'extend', key: 'nope', minutes: 5 }, { now }),
    ).toEqual({ ok: false, error: { code: 'unknownStep' } });
    expect(
      await service.applyEvent(
        'missing',
        { type: 'extend', key: feed.stepKey, minutes: 5 },
        { now },
      ),
    ).toEqual({ ok: false, error: { code: 'notFound' } });
    await service.applyEvent(
      bake.bake.id,
      { type: 'stepDone', key: feed.stepKey, at: at('2026-11-27', '11:00') },
      { now },
    );
    expect(
      await service.applyEvent(
        bake.bake.id,
        { type: 'stepDone', key: feed.stepKey, at: at('2026-11-27', '11:30') },
        { now },
      ),
    ).toEqual({ ok: false, error: { code: 'alreadyDone' } });
    await service.cancel(bake.bake.id, now);
    expect(
      await service.applyEvent(
        bake.bake.id,
        { type: 'extend', key: feed.stepKey, minutes: 5 },
        { now },
      ),
    ).toEqual({ ok: false, error: { code: 'notActive' } });
  });
});

describe('finish, cancel and sweep', () => {
  it('finish completes the bake and can be undone', async () => {
    const { db, service, seen } = await setup();
    const bake = await makeBake(db, { mode: 'forward' });
    expect(bake.bake.status).toBe('active');
    db.clock.advance(1000);
    const finished = await service.finish(bake.bake.id, NOW + 3_600_000);
    if (!finished.ok) throw new Error('finish failed');
    expect((await reload(db, bake.bake.id)).bake).toMatchObject({ status: 'completed' });
    db.clock.advance(1000);
    expect(await service.revert(finished.value.revertToken)).toEqual({ ok: true });
    expect((await reload(db, bake.bake.id)).bake).toMatchObject({
      status: 'active',
      completedAt: null,
    });
    expect(seen.map((s) => s[1])).toEqual(['finish', 'revert']);
  });

  it('the final step "Done, finish bake" writes the step and completes the bake in one change', async () => {
    const { db, service } = await setup();
    const bake = await makeBake(db);
    const cool = stepByName(bake, 'Cool');
    const now = at('2026-11-28', '10:05');
    const outcome = await service.applyEvent(
      bake.bake.id,
      { type: 'stepDone', key: cool.stepKey, at: now },
      { now, finish: true },
    );
    if (!outcome.ok) throw new Error('apply failed');
    const after = await reload(db, bake.bake.id);
    expect(after.bake.status).toBe('completed');
    expect(after.bake.completedAt).toBe(new Date(now).toISOString());
    expect(stepByName(after, 'Cool').status).toBe('done');
  });

  it('cancel sets cancelled and notifies', async () => {
    const { db, service, seen } = await setup();
    const bake = await makeBake(db);
    await service.cancel(bake.bake.id, NOW);
    expect((await reload(db, bake.bake.id)).bake).toMatchObject({ status: 'cancelled' });
    expect(seen).toEqual([[bake.bake.id, 'cancel']]);
  });

  it('sweep activates a scheduled bake once its first step is due', async () => {
    const { db, service, seen } = await setup();
    const bake = await makeBake(db);
    expect(await service.sweep(at('2026-11-27', '03:00'))).toEqual([]);
    expect(await service.sweep(at('2026-11-27', '03:05'))).toEqual([bake.bake.id]);
    expect((await reload(db, bake.bake.id)).bake).toMatchObject({
      status: 'active',
      startedAt: '2026-11-27T08:05:00.000Z',
    });
    // Idempotent.
    expect(await service.sweep(at('2026-11-27', '03:10'))).toEqual([]);
    expect(seen).toEqual([[bake.bake.id, 'sweep']]);
  });

  it('sweep completes a bake 12 h after its ready time and leaves step rows alone', async () => {
    const { db, service } = await setup();
    const bake = await makeBake(db);
    const ready = fromIso('2026-11-28T15:00:00.000Z');
    await service.sweep(ready + STALE_AFTER_MS);
    expect((await reload(db, bake.bake.id)).bake.status).toBe('active');
    expect(await service.sweep(ready + STALE_AFTER_MS + MIN)).toEqual([bake.bake.id]);
    const after = await reload(db, bake.bake.id);
    expect(after.bake).toMatchObject({
      status: 'completed',
      completedAt: '2026-11-28T15:00:00.000Z',
    });
    expect(after.steps.every((s) => s.status === 'pending')).toBe(true);
  });

  it('two concurrent bakes recompute independently', async () => {
    const { db, service } = await setup();
    const a = await makeBake(db);
    const b = await makeBake(db, {
      recipes: [{ id: WHOLE_WHEAT }],
      ready: { date: '2026-11-28', time: '12:00' },
    });
    const bulkA = stepByName(a, 'Bulk ferment');
    const before = await reload(db, b.bake.id);
    await service.applyEvent(
      a.bake.id,
      { type: 'extend', key: bulkA.stepKey, minutes: 30 },
      { now: NOW },
    );
    const after = await reload(db, b.bake.id);
    expect(after.bake.plannedReadyAt).toBe(before.bake.plannedReadyAt);
    expect(after.steps.map((s) => s.plannedStartAt)).toEqual(
      before.steps.map((s) => s.plannedStartAt),
    );
  });
});

describe('races (SEC-M45-02)', () => {
  it('a cancel that lands during a sweep is not undone by it', async () => {
    const { db, service } = await setup();
    const bake = await makeBake(db);
    const original = db.repos.bakes.list.bind(db.repos.bakes);
    // The sweep has read the bake as scheduled when the baker cancels it.
    jest.spyOn(db.repos.bakes, 'list').mockImplementation(async (...args) => {
      const rows = await original(...args);
      await service.cancel(bake.bake.id, NOW);
      return rows;
    });
    expect(await service.sweep(at('2026-11-27', '04:00'))).toEqual([]);
    expect((await reload(db, bake.bake.id)).bake.status).toBe('cancelled');
    jest.restoreAllMocks();
  });

  it('a finish that races applyEvent leaves a completed bake, whichever lands first', async () => {
    const { db, service } = await setup();
    const bake = await makeBake(db);
    const bulk = stepByName(bake, 'Bulk ferment');
    const [applied, finished] = await Promise.all([
      service.applyEvent(
        bake.bake.id,
        { type: 'extend', key: bulk.stepKey, minutes: 15 },
        { now: NOW },
      ),
      service.finish(bake.bake.id, NOW),
    ]);
    expect(finished.ok).toBe(true);
    // applyEvent either ran first (and the finish still won) or was refused as notActive.
    if (!applied.ok) expect(applied.error.code).toBe('notActive');
    expect((await reload(db, bake.bake.id)).bake.status).toBe('completed');
  });

  it('two sweeps at once share one run', async () => {
    const { db, service } = await setup();
    const bake = await makeBake(db);
    const now = at('2026-11-27', '04:00');
    const [a, b] = await Promise.all([service.sweep(now), service.sweep(now)]);
    expect(a).toEqual([bake.bake.id]);
    expect(b).toEqual([bake.bake.id]);
  });

  it('an event on a bake that was finished meanwhile writes nothing', async () => {
    const { db, service } = await setup();
    const bake = await makeBake(db);
    const bulk = stepByName(bake, 'Bulk ferment');
    await service.finish(bake.bake.id, NOW);
    const before = await reload(db, bake.bake.id);
    const result = await service.applyEvent(
      bake.bake.id,
      { type: 'extend', key: bulk.stepKey, minutes: 15 },
      { now: NOW },
    );
    expect(result).toEqual({ ok: false, error: { code: 'notActive' } });
    expect((await reload(db, bake.bake.id)).steps.map((s) => s.plannedEndAt)).toEqual(
      before.steps.map((s) => s.plannedEndAt),
    );
  });
});
