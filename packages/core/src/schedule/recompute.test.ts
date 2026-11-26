import { describe, expect, it } from 'vitest';
import { planBake, type BakePlan, type PlanInput } from './backward';
import { defaultTemplate } from './fixtures';
import { holdCapacity, recomputePlan, type StepProgress } from './recompute';

const MIN = 60_000;
const READY = Date.parse('2026-05-02T14:00:00Z');

const item = (itemId: string, loaves = 1) => ({
  itemId,
  label: itemId,
  steps: defaultTemplate(),
  loaves,
});
const plan = (input: PlanInput): BakePlan => {
  const r = planBake(input, { mode: 'backward', readyAt: READY, now: 0 });
  if (r.status !== 'ok') throw new Error('expected ok');
  return r.plan;
};
const step = (p: BakePlan, key: string) => p.steps.find((s) => s.key === key)!;
const go = (
  p: BakePlan,
  prog: StepProgress[],
  ev: Parameters<typeof recomputePlan>[2],
  ctx?: Parameters<typeof recomputePlan>[3],
) => {
  const r = recomputePlan(p, prog, ev, ctx);
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};

describe('recomputePlan', () => {
  const p0 = plan({ items: [item('A', 3)], ovenCapacity: 2 });

  it('shifts later oven slots, preheat and slot windows with the item', () => {
    const bulk = step(p0, 'A:bulk');
    const r = go(p0, [], { type: 'stepDone', key: 'A:bulk', at: bulk.endAt + 10 * MIN });
    expect(step(r.plan, 'A:bakeCovered:s2').startAt).toBe(
      step(p0, 'A:bakeCovered:s2').startAt + 10 * MIN,
    );
    expect(step(r.plan, 'bake:preheat').startAt).toBe(step(p0, 'bake:preheat').startAt + 10 * MIN);
    expect(r.plan.slots[1]!.startAt).toBe(p0.slots[1]!.startAt + 10 * MIN);
    expect(r.plan.readyAt).toBe(READY + 10 * MIN);
    expect(r.plan.warnings.filter((w) => w.code === 'ovenConflict')).toEqual([]);
  });

  it('stepStarted shifts the step and everything after it', () => {
    const shape = step(p0, 'A:shape');
    const r = go(p0, [], { type: 'stepStarted', key: 'A:shape', at: shape.startAt + 5 * MIN });
    expect(step(r.plan, 'A:shape').endAt).toBe(shape.endAt + 5 * MIN);
    expect(r.deltaMin).toBe(5);
    expect(r.progress.find((p) => p.key === 'A:shape')).toMatchObject({ status: 'active' });
  });

  it('Hold ready time: extend the hold step by minus the delta restores the ready time', () => {
    const late = go(p0, [], {
      type: 'stepDone',
      key: 'A:bulk',
      at: step(p0, 'A:bulk').endAt + 30 * MIN,
    });
    const cap = holdCapacity(late.plan, 'A')!;
    expect(cap).toEqual({ holdKey: 'A:cold', canAbsorbEarlyMin: 720, canAbsorbLateMin: 0 });
    const held = go(late.plan, late.progress, { type: 'extend', key: 'A:cold', minutes: -30 });
    // cold ferment is already at its minimum, so reality wins but warns
    expect(held.plan.readyAt).toBe(READY);
    expect(held.plan.warnings).toContainEqual({
      code: 'durationOutOfRange',
      stepKey: 'A:cold',
      minutes: 690,
    });
  });

  it('now keeps an early shift from moving unstarted steps into the past', () => {
    const bulk = step(p0, 'A:bulk');
    const now = bulk.endAt - 5 * MIN;
    const r = go(p0, [], { type: 'stepDone', key: 'A:bulk', at: bulk.endAt - 60 * MIN }, { now });
    expect(step(r.plan, 'A:shape').startAt).toBe(now);
  });

  it('quiet + zone returns quiet-hours warnings for steps not yet started', () => {
    const quiet = { enabled: true, startMin: 0, endMin: 23 * 60 + 59 };
    const r = go(p0, [], { type: 'extend', key: 'A:bulk', minutes: 1 }, { quiet, zone: 'UTC' });
    expect(r.plan.warnings.some((w) => w.code === 'quietHours')).toBe(true);
    const done = go(
      p0,
      [],
      { type: 'stepDone', key: 'A:shape', at: step(p0, 'A:shape').endAt },
      { quiet, zone: 'UTC' },
    );
    expect(
      done.plan.warnings.filter((w) => w.code === 'quietHours' && w.stepKey === 'A:feed'),
    ).toEqual([]);
  });

  it('flags an oven conflict when one item overruns into another slot', () => {
    const two = plan({ items: [item('A'), item('B')], ovenCapacity: 1 });
    const bake = step(two, 'A:bakeUncovered:s1');
    const r = go(two, [], { type: 'extend', key: 'A:bakeUncovered:s1', minutes: 10 });
    expect(bake.durationMin).toBe(15);
    expect(r.plan.warnings).toContainEqual({ code: 'ovenConflict', slotIndexes: [1, 2] });
    // B's own schedule is untouched
    expect(step(r.plan, 'B:bakeCovered:s2').startAt).toBe(step(two, 'B:bakeCovered:s2').startAt);
  });

  it('typed errors and purity', () => {
    expect(recomputePlan(p0, [], { type: 'stepDone', key: 'zzz', at: 0 })).toEqual({
      ok: false,
      error: { code: 'unknownStep', key: 'zzz' },
    });
    const frozen = JSON.stringify(p0);
    go(p0, [], { type: 'extend', key: 'A:bulk', minutes: 5 });
    expect(JSON.stringify(p0)).toBe(frozen);
  });
});
