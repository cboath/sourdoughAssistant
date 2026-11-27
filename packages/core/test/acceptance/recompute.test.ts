/* eslint-disable @typescript-eslint/no-explicit-any -- table-driven tests pass loosely typed fixtures */
/**
 * QA-02: live bake recompute (core-cases section 10, ADR 0010 section 7, AMB-11 pure shift both ways).
 * Owned by CO-03 (src/schedule/recompute.ts).
 */
import { describe, expect, it } from 'vitest';
import { quietHoursWarnings } from '../../src/schedule/quiet';
import { localToUtc } from '../../src/schedule/time';
import { backward, loadRecompute } from './support/plan';
import {
  deepFreeze,
  defaultTemplate,
  input,
  ITEM,
  iso,
  MAY2,
  MIN,
  ms,
  NY,
  pendingProgress,
  SPRING,
  stepOf,
} from './support/fixtures';

const FAR_PAST = ms('2025-01-01T00:00:00.000Z');
const LATER = ['shape', 'cold', 'preheat', 'bake1', 'bake2', 'cool'];
const EARLIER = ['feed', 'mix', 'folds'];

const basePlan = (e = MAY2, inp: any = input()) => {
  const r = backward(inp, localToUtc(e.readyLocal, e.zone).at, FAR_PAST);
  expect(r.status).toBe('ok');
  return r.plan;
};
const run = async (plan: any, progress: any[], event: any) => {
  const { recomputePlan } = await loadRecompute();
  const r = recomputePlan(plan, progress, event);
  expect(r.ok).toBe(true);
  return r.value;
};
const starts = (plan: any, ids: string[]) =>
  Object.fromEntries(ids.map((id) => [id, stepOf(plan, ITEM, id).startAt]));
const plusMin = (o: Record<string, number>, m: number) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v + m * MIN]));

describe('recomputePlan: pure shift (AMB-11)', () => {
  const p0 = basePlan();
  const bulkEnd = stepOf(p0, ITEM, 'bulk').endAt;

  it.each([
    ['LIV-01 bulk done 40 min late', 40],
    ['LIV-02 bulk done 20 min early', -20],
    ['LIV-03 on time', 0],
  ])('%s: later steps and readyAt shift by the delta, earlier steps do not', async (_n, delta) => {
    const r = await run(p0, pendingProgress(p0), {
      type: 'stepDone',
      key: stepOf(p0, ITEM, 'bulk').key,
      at: bulkEnd + delta * MIN,
    });
    expect(r.deltaMin).toBe(delta);
    expect(r.plan.readyAt).toBe(p0.readyAt + delta * MIN);
    expect(starts(r.plan, LATER)).toEqual(plusMin(starts(p0, LATER), delta));
    expect(starts(r.plan, EARLIER)).toEqual(starts(p0, EARLIER));
    if (delta !== 0)
      for (const id of LATER) expect(r.shiftedKeys).toContain(stepOf(p0, ITEM, id).key);
    for (const id of EARLIER) expect(r.shiftedKeys).not.toContain(stepOf(p0, ITEM, id).key);
    if (delta === 0) expect(r.shiftedKeys).toEqual([]);
  });

  it('LIV-01 exact local times: Shape 20:45, Cold 20:55, Preheat 08:25, Bake 08:55, 09:25, Cool 09:40, Ready 10:40 (EDT)', async () => {
    const r = await run(p0, pendingProgress(p0), {
      type: 'stepDone',
      key: stepOf(p0, ITEM, 'bulk').key,
      at: bulkEnd + 40 * MIN,
    });
    expect(iso(stepOf(r.plan, ITEM, 'shape').startAt)).toBe('2026-05-02T00:45:00.000Z');
    expect(iso(stepOf(r.plan, ITEM, 'cold').startAt)).toBe('2026-05-02T00:55:00.000Z');
    expect(iso(stepOf(r.plan, ITEM, 'preheat').startAt)).toBe('2026-05-02T12:25:00.000Z');
    expect(iso(stepOf(r.plan, ITEM, 'bake1').startAt)).toBe('2026-05-02T12:55:00.000Z');
    expect(iso(r.plan.readyAt)).toBe('2026-05-02T14:40:00.000Z');
  });
  it('earlier steps are marked done (inferred) and the finished step is done with actualEndAt', async () => {
    const key = stepOf(p0, ITEM, 'bulk').key;
    const r = await run(p0, pendingProgress(p0), { type: 'stepDone', key, at: bulkEnd + 40 * MIN });
    const by = Object.fromEntries(r.progress.map((x: any) => [x.key, x]));
    expect(by[key]).toMatchObject({ status: 'done', actualEndAt: bulkEnd + 40 * MIN });
    for (const id of EARLIER)
      expect(by[stepOf(p0, ITEM, id).key]).toMatchObject({ status: 'done', inferredDone: true });
    expect(by[stepOf(p0, ITEM, 'shape').key].status).toBe('pending');
  });
  it('LIV-04 started 20 min late, ended on time: net zero for later steps', async () => {
    const key = stepOf(p0, ITEM, 'bulk').key;
    const started = await run(p0, pendingProgress(p0), {
      type: 'stepStarted',
      key,
      at: stepOf(p0, ITEM, 'bulk').startAt + 20 * MIN,
    });
    expect(started.plan.readyAt).toBe(p0.readyAt + 20 * MIN);
    const done = await run(started.plan, started.progress, { type: 'stepDone', key, at: bulkEnd });
    expect(done.plan.readyAt).toBe(p0.readyAt);
    expect(starts(done.plan, LATER)).toEqual(starts(p0, LATER));
  });
  it('LIV-05 started 20 min late and kept full duration: +20', async () => {
    const key = stepOf(p0, ITEM, 'bulk').key;
    const started = await run(p0, pendingProgress(p0), {
      type: 'stepStarted',
      key,
      at: stepOf(p0, ITEM, 'bulk').startAt + 20 * MIN,
    });
    const done = await run(started.plan, started.progress, {
      type: 'stepDone',
      key,
      at: bulkEnd + 20 * MIN,
    });
    expect(done.plan.readyAt).toBe(p0.readyAt + 20 * MIN);
  });
  it('LIV-08 two consecutive late completions (+10, +15) accumulate to +25', async () => {
    const a = await run(p0, pendingProgress(p0), {
      type: 'stepDone',
      key: stepOf(p0, ITEM, 'bulk').key,
      at: bulkEnd + 10 * MIN,
    });
    const coldKey = stepOf(a.plan, ITEM, 'cold').key;
    const b = await run(a.plan, a.progress, {
      type: 'stepDone',
      key: coldKey,
      at: stepOf(a.plan, ITEM, 'cold').endAt + 15 * MIN,
    });
    expect(b.plan.readyAt).toBe(p0.readyAt + 25 * MIN);
    expect(b.deltaMin).toBe(15);
  });
  it('LIV-10 out-of-order done: earlier pending steps become inferred done', async () => {
    const r = await run(p0, pendingProgress(p0), {
      type: 'stepDone',
      key: stepOf(p0, ITEM, 'shape').key,
      at: stepOf(p0, ITEM, 'shape').endAt,
    });
    const by = Object.fromEntries(r.progress.map((x: any) => [x.key, x]));
    expect(by[stepOf(p0, ITEM, 'bulk').key]).toMatchObject({ status: 'done', inferredDone: true });
  });
  it('LIV-11 marking a done step done again is rejected with alreadyDone', async () => {
    const { recomputePlan } = await loadRecompute();
    const key = stepOf(p0, ITEM, 'bulk').key;
    const first = await run(p0, pendingProgress(p0), { type: 'stepDone', key, at: bulkEnd });
    expect(
      recomputePlan(first.plan, first.progress, { type: 'stepDone', key, at: bulkEnd }),
    ).toEqual({
      ok: false,
      error: { code: 'alreadyDone', key },
    });
  });
  it('LIV-13 Cool done 15 min early: ready time becomes the actual end', async () => {
    const cool = stepOf(p0, ITEM, 'cool');
    const r = await run(p0, pendingProgress(p0), {
      type: 'stepDone',
      key: cool.key,
      at: cool.endAt - 15 * MIN,
    });
    expect(r.plan.readyAt).toBe(p0.readyAt - 15 * MIN);
  });
  it('LIV-06 8 h late bulk: shape and cold now land in quiet hours (Sat 04:05, 04:15), ready Sat 18:00', async () => {
    const r = await run(p0, pendingProgress(p0), {
      type: 'stepDone',
      key: stepOf(p0, ITEM, 'bulk').key,
      at: bulkEnd + 480 * MIN,
    });
    expect(iso(r.plan.readyAt)).toBe('2026-05-02T22:00:00.000Z');
    const ws = quietHoursWarnings(r.plan, { enabled: true, startMin: 1320, endMin: 360 }, NY).map(
      (w: any) => w.stepKey,
    );
    expect(ws).toContain(stepOf(p0, ITEM, 'shape').key);
    expect(ws).toContain(stepOf(p0, ITEM, 'cold').key);
  });
  it('purity: frozen inputs are not mutated and results are deterministic', async () => {
    const key = stepOf(p0, ITEM, 'bulk').key;
    const plan = deepFreeze(structuredClone(p0));
    const prog = deepFreeze(pendingProgress(p0));
    const a = await run(plan, prog, { type: 'stepDone', key, at: bulkEnd + 5 * MIN });
    expect(await run(plan, prog, { type: 'stepDone', key, at: bulkEnd + 5 * MIN })).toEqual(a);
  });
  it('DST-11 feeding finished 40 min late across spring forward: +40 elapsed, ready Sun 10:40 EDT, cold still 720', async () => {
    const p = basePlan(SPRING);
    const feed = stepOf(p, ITEM, 'feed');
    const r = await run(p, pendingProgress(p), {
      type: 'stepDone',
      key: feed.key,
      at: feed.endAt + 40 * MIN,
    });
    expect(iso(r.plan.readyAt)).toBe('2026-03-08T14:40:00.000Z');
    const cold = stepOf(r.plan, ITEM, 'cold');
    expect(cold.endAt - cold.startAt).toBe(720 * MIN);
  });
});

describe('recomputePlan: folds, extend, errors', () => {
  const p0 = basePlan();
  const folds = stepOf(p0, ITEM, 'folds');

  it('foldDone: Fold 1 done 10 min late re-anchors folds 2-4 at 30 min spacing and shifts the rest +10', async () => {
    const r = await run(p0, pendingProgress(p0), {
      type: 'foldDone',
      key: folds.key,
      foldIndex: 1,
      at: folds.startAt + 10 * MIN,
    });
    const f = stepOf(r.plan, ITEM, 'folds');
    expect(f.folds.map((x: any) => x.at)).toEqual(
      [0, 30, 60, 90]
        .map((m) => folds.startAt + (10 + m) * MIN)
        .map((t, i) => (i === 0 ? folds.folds[0]!.at : t)),
    );
    expect(f.endAt).toBe(folds.endAt + 10 * MIN);
    expect(r.plan.readyAt).toBe(p0.readyAt + 10 * MIN);
    expect(r.progress.find((x: any) => x.key === folds.key).foldTimes).toEqual([
      folds.startAt + 10 * MIN,
    ]);
  });
  it('foldDone: Fold 4 of 4 done on time ends the step one interval later', async () => {
    let plan = p0;
    let prog = pendingProgress(p0);
    for (let i = 1; i <= 4; i++) {
      const r = await run(plan, prog, {
        type: 'foldDone',
        key: folds.key,
        foldIndex: i,
        at: folds.folds[i - 1]!.at,
      });
      plan = r.plan;
      prog = r.progress;
    }
    expect(plan.readyAt).toBe(p0.readyAt);
    expect(stepOf(plan, ITEM, 'folds').endAt).toBe(folds.endAt);
  });
  it('extend +15 on bulk shifts later steps and ready time by 15', async () => {
    const r = await run(p0, pendingProgress(p0), {
      type: 'extend',
      key: stepOf(p0, ITEM, 'bulk').key,
      minutes: 15,
    });
    expect(stepOf(r.plan, ITEM, 'bulk').durationMin).toBe(375);
    expect(r.plan.readyAt).toBe(p0.readyAt + 15 * MIN);
    expect(r.deltaMin).toBe(15);
  });
  it('extend outside the range is allowed but warns durationOutOfRange', async () => {
    const r = await run(p0, pendingProgress(p0), {
      type: 'extend',
      key: stepOf(p0, ITEM, 'bulk').key,
      minutes: 200,
    });
    expect(r.plan.warnings).toContainEqual({
      code: 'durationOutOfRange',
      stepKey: stepOf(p0, ITEM, 'bulk').key,
      minutes: 560,
    });
  });
  it('typed errors: unknownStep, notAFoldStep, invalidFoldIndex', async () => {
    const { recomputePlan } = await loadRecompute();
    const prog = pendingProgress(p0);
    expect(recomputePlan(p0, prog, { type: 'stepDone', key: 'nope', at: 0 })).toEqual({
      ok: false,
      error: { code: 'unknownStep', key: 'nope' },
    });
    const bulk = stepOf(p0, ITEM, 'bulk').key;
    expect(
      recomputePlan(p0, prog, { type: 'foldDone', key: bulk, foldIndex: 1, at: 0 }),
    ).toMatchObject({ ok: false, error: { code: 'notAFoldStep', key: bulk } });
    for (const i of [0, 5]) {
      expect(
        recomputePlan(p0, prog, { type: 'foldDone', key: folds.key, foldIndex: i, at: 0 }),
      ).toMatchObject({ ok: false, error: { code: 'invalidFoldIndex' } });
    }
  });
  it('holdCapacity on the cold ferment (720, range 720-1440): can absorb 0 one way and 720 the other', async () => {
    const { holdCapacity } = await loadRecompute();
    const h = holdCapacity(p0, ITEM);
    expect(h.holdKey).toBe(stepOf(p0, ITEM, 'cold').key);
    expect([h.canAbsorbEarlyMin, h.canAbsorbLateMin].sort((a, b) => a - b)).toEqual([0, 720]);
  });
});

describe('recomputePlan: multi-recipe (ADR 0009 r10, ADR 0010 s7)', () => {
  it('LIV-14 item C feeding 40 min late: only C shifts; A and B stay put', async () => {
    const mk = (id: string) => ({ itemId: id, label: id, steps: defaultTemplate(), loaves: 1 });
    const r0 = backward(
      { items: [mk('A'), mk('B'), mk('C')], ovenCapacity: 2 },
      ms(MAY2.readyUtc),
      FAR_PAST,
    );
    expect(r0.status).toBe('ok');
    const p = r0.plan;
    const feed = stepOf(p, 'C', 'feed');
    const r = await run(p, pendingProgress(p), {
      type: 'stepDone',
      key: feed.key,
      at: feed.endAt + 40 * MIN,
    });
    expect(r.deltaMin).toBe(40);
    for (const id of ['A', 'B'])
      for (const s of ['feed', 'mix', 'bake1', 'cool'])
        expect(stepOf(r.plan, id, s).startAt).toBe(stepOf(p, id, s).startAt);
    expect(stepOf(r.plan, 'C', 'mix').startAt).toBe(stepOf(p, 'C', 'mix').startAt + 40 * MIN);
    expect(stepOf(r.plan, 'C', 'cool').endAt).toBe(stepOf(p, 'C', 'cool').endAt + 40 * MIN);
  });
});
