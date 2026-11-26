import { describe, expect, it } from 'vitest';
import { planBake, type BakePlan, type PlanInput } from './backward';
import { defaultTemplate } from './fixtures';
import { layoutSlots } from './multi';

const MIN = 60_000;
const READY = Date.parse('2026-05-02T14:00:00Z');
const NOW = 0;

const item = (itemId: string, loaves = 1, steps = defaultTemplate()) => ({
  itemId,
  label: itemId,
  steps,
  loaves,
});
const plan = (input: PlanInput): BakePlan => {
  const r = planBake(input, { mode: 'backward', readyAt: READY, now: NOW });
  if (r.status !== 'ok') throw new Error(JSON.stringify(r));
  return r.plan;
};
const step = (p: BakePlan, key: string) => p.steps.find((s) => s.key === key)!;

describe('layoutSlots', () => {
  it('anchors the last slot to ready and runs earlier slots back to back', () => {
    const timing = new Map([['A', { ovenMin: 45, tailMin: 60 }]]);
    const slots = layoutSlots(
      [
        { index: 1, loaves: [{ itemId: 'A', loaves: 2 }] },
        { index: 2, loaves: [{ itemId: 'A', loaves: 1 }] },
      ],
      timing,
      READY,
      0,
    );
    expect(slots[1]!.startAt).toBe(READY - 105 * MIN);
    expect(slots[1]!.endAt).toBe(READY - 60 * MIN);
    expect(slots[0]!.endAt).toBe(slots[1]!.startAt);
    expect(slots[0]!.startAt).toBe(slots[1]!.startAt - 45 * MIN);
  });
  it('honours a reheat gap', () => {
    const timing = new Map([['A', { ovenMin: 45, tailMin: 60 }]]);
    const slots = layoutSlots(
      [
        { index: 1, loaves: [{ itemId: 'A', loaves: 1 }] },
        { index: 2, loaves: [{ itemId: 'A', loaves: 1 }] },
      ],
      timing,
      READY,
      20,
    );
    expect(slots[1]!.startAt - slots[0]!.endAt).toBe(20 * MIN);
  });
});

describe('planBake with several slots', () => {
  it('splits one item across slots: dough once, an oven track per slot', () => {
    const p = plan({ items: [item('A', 3)], ovenCapacity: 2 });
    expect(p.slots.map((s) => s.loaves)).toEqual([
      [{ itemId: 'A', loaves: 2 }],
      [{ itemId: 'A', loaves: 1 }],
    ]);
    expect(p.steps.filter((s) => s.key === 'A:feed')).toHaveLength(1);
    const b1 = step(p, 'A:bakeCovered:s1');
    const b2 = step(p, 'A:bakeCovered:s2');
    expect(b2.startAt - b1.startAt).toBe(45 * MIN);
    expect(b1.loaves).toBe(2);
    expect(b2.loaves).toBe(1);
    expect(b2.name).toBe('Bake, covered');
    expect(b2.slotIndex).toBe(2);
    expect(step(p, 'A:cool:s2').endAt).toBe(READY);
    expect(p.steps.filter((s) => s.kind === 'preheat')).toHaveLength(1);
    expect(step(p, 'bake:preheat').endAt).toBe(b1.startAt);
    // later loaves wait 45 min longer in the cold ferment, still inside 720..1440
    expect(p.warnings.filter((w) => w.code === 'holdExceedsRange')).toEqual([]);
  });

  it('warns when the hold step would exceed its range', () => {
    const steps = defaultTemplate().map((s) =>
      s.id === 'cold' ? { ...s, durationMin: 1430, maxMin: 1440 } : s,
    );
    const p = plan({ items: [item('A', 2, steps)], ovenCapacity: 1 });
    expect(p.warnings).toContainEqual({
      code: 'holdExceedsRange',
      stepKey: 'A:cold',
      effectiveMin: 1475,
      maxMin: 1440,
    });
  });

  it('emits reheat pseudo-steps for a positive gap', () => {
    const p = plan({ items: [item('A', 2)], ovenCapacity: 1, reheatGapMin: 15 });
    const r = step(p, 'bake:reheat:s2');
    expect(r.endAt - r.startAt).toBe(15 * MIN);
    expect(r.endAt).toBe(step(p, 'A:bakeCovered:s2').startAt);
    expect(step(p, 'A:bakeCovered:s2').startAt - step(p, 'A:bakeUncovered:s1').endAt).toBe(
      15 * MIN,
    );
    expect(p.warnings.filter((w) => w.code === 'ovenConflict')).toEqual([]);
  });

  it('rejects a recipe without an oven phase when more than one slot is needed', () => {
    const noOven = defaultTemplate().filter((s) => s.kind !== 'bake' && s.kind !== 'preheat');
    const r = planBake(
      { items: [item('A', 3), item('B', 1, noOven)], ovenCapacity: 2 },
      { mode: 'backward', readyAt: READY, now: NOW },
    );
    expect(r).toEqual({ status: 'invalid', errors: [{ code: 'noOvenPhase' }] });
  });

  it('forward mode starts at startAt with several slots', () => {
    const start = Date.parse('2026-05-01T00:00:00Z');
    const r = planBake(
      { items: [item('A', 3)], ovenCapacity: 2 },
      { mode: 'forward', startAt: start, now: start },
    );
    if (r.status !== 'ok') throw new Error('expected ok');
    expect(r.plan.startAt).toBe(start);
  });
});
