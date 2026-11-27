/* eslint-disable @typescript-eslint/no-explicit-any -- table-driven tests pass loosely typed fixtures */
/**
 * QA-02: multi-recipe bakes and oven slots (core-cases section 9, ADR 0009).
 * ADR 0009 Accepted (open-questions B1: last batch, no reheat gap; B7: at most 4 recipes, enforced by the schedule screen). Owned by CO-03 (multi.ts).
 * Slot indexes are 1-based and oven/tail step keys carry ':s<slot>' (per CO-02).
 */
import { describe, expect, it } from 'vitest';
import { quietHoursWarnings } from '../../src/schedule/quiet';
import { assignOvenSlots, backward, planBake } from './support/plan';
import {
  defaultTemplate,
  iso,
  MAY2,
  MIN,
  ms,
  NOW_ISO,
  NY,
  preheatSteps,
  stepOf,
} from './support/fixtures';

const FAR_PAST = ms('2025-01-01T00:00:00.000Z');
const READY = ms(MAY2.readyUtc);
const NIGHT = { enabled: true, startMin: 1320, endMin: 360 };

const mk = (id: string, loaves = 1, over: Record<string, unknown> = {}) => ({
  itemId: id,
  label: `Recipe ${id}`,
  steps: defaultTemplate(),
  loaves,
  ...over,
});
const bakeOf = (items: any[], cap: number, extra: Record<string, unknown> = {}) => ({
  items,
  ovenCapacity: cap,
  ...extra,
});
const planOf = (items: any[], cap: number) => {
  const r = backward(bakeOf(items, cap), READY, FAR_PAST);
  expect(r.status).toBe('ok');
  return r.plan;
};
/** Expected UTC start of a step for an item whose whole schedule is the MAY2 schedule shifted by offsetMin. */
const shifted = (stepId: string, offsetMin: number) =>
  iso(ms(MAY2.starts[stepId]!) + offsetMin * MIN);
const loafLists = (slots: any[]) =>
  slots.map((s) => s.loaves.map((l: any) => [l.itemId, l.loaves]));

describe('assignOvenSlots (ADR 0009 rule 2)', () => {
  it.each([
    [
      'M3 loaves A,B,C cap 2',
      [
        ['A', 1],
        ['B', 1],
        ['C', 1],
      ],
      2,
      [
        [
          ['A', 1],
          ['B', 1],
        ],
        [['C', 1]],
      ],
    ],
    ['M3a one item x3, cap 2', [['A', 3]], 2, [[['A', 2]], [['A', 1]]]],
    [
      'MUL-05 cap 3 holds all',
      [
        ['A', 1],
        ['B', 1],
        ['C', 1],
      ],
      3,
      [
        [
          ['A', 1],
          ['B', 1],
          ['C', 1],
        ],
      ],
    ],
    [
      'MUL-05b cap exceeds loaves',
      [
        ['A', 1],
        ['B', 1],
        ['C', 1],
      ],
      5,
      [
        [
          ['A', 1],
          ['B', 1],
          ['C', 1],
        ],
      ],
    ],
    [
      'MUL-03 cap 1',
      [
        ['A', 1],
        ['B', 1],
        ['C', 1],
      ],
      1,
      [[['A', 1]], [['B', 1]], [['C', 1]]],
    ],
    [
      'MUL-06 four loaves cap 2',
      [
        ['A', 1],
        ['B', 1],
        ['C', 1],
        ['D', 1],
      ],
      2,
      [
        [
          ['A', 1],
          ['B', 1],
        ],
        [
          ['C', 1],
          ['D', 1],
        ],
      ],
    ],
    [
      'MUL-07 five loaves cap 2',
      [
        ['A', 1],
        ['B', 1],
        ['C', 1],
        ['D', 1],
        ['E', 1],
      ],
      2,
      [
        [
          ['A', 1],
          ['B', 1],
        ],
        [
          ['C', 1],
          ['D', 1],
        ],
        [['E', 1]],
      ],
    ],
    [
      'loaf by loaf: item B splits across slots',
      [
        ['A', 1],
        ['B', 2],
      ],
      2,
      [
        [
          ['A', 1],
          ['B', 1],
        ],
        [['B', 1]],
      ],
    ],
  ])('%s', (_n, items, cap, expected) => {
    const slots = assignOvenSlots(
      items.map(([itemId, loaves]) => ({ itemId, loaves })),
      cap,
    );
    expect(loafLists(slots)).toEqual(expected);
    expect(slots.map((s: any) => s.index)).toEqual(slots.map((_: any, i: number) => i + 1)); // 1-based
  });
});

describe('planBake multi-recipe (ADR 0009)', () => {
  const abc = () => [mk('A'), mk('B'), mk('C')];

  it('MUL-01 3 loaves cap 2: A and B share slot 1 at -45 min, C is slot 2 and ends at readyAt', () => {
    const p = planOf(abc(), 2);
    for (const id of ['A', 'B']) {
      for (const step of [
        'feed',
        'mix',
        'folds',
        'bulk',
        'shape',
        'cold',
        'bake1',
        'bake2',
        'cool',
      ]) {
        expect(iso(stepOf(p, id, step).startAt)).toBe(shifted(step, -45));
      }
    }
    for (const step of [
      'feed',
      'mix',
      'folds',
      'bulk',
      'shape',
      'cold',
      'bake1',
      'bake2',
      'cool',
    ]) {
      expect(iso(stepOf(p, 'C', step).startAt)).toBe(MAY2.starts[step]);
    }
    expect(stepOf(p, 'C', 'cool').endAt).toBe(READY);
    expect(stepOf(p, 'A', 'cool').endAt).toBe(READY - 45 * MIN);
    expect(p.readyAt).toBe(READY);
    expect(loafLists(p.slots)).toEqual([
      [
        ['A', 1],
        ['B', 1],
      ],
      [['C', 1]],
    ]);
  });
  it('MUL-02 one merged preheat before slot 1 (Sat 07:00 EDT), none for slot 2', () => {
    const pre = preheatSteps(planOf(abc(), 2));
    expect(pre).toHaveLength(1);
    expect(pre[0]!.key).toBe('bake:preheat');
    expect(iso(pre[0]!.startAt)).toBe('2026-05-02T11:00:00.000Z');
    expect(iso(pre[0]!.endAt)).toBe('2026-05-02T11:30:00.000Z');
  });
  it('MUL-16 slots run back to back and never overlap in the oven', () => {
    const { slots } = planOf(abc(), 2);
    expect(slots).toHaveLength(2);
    expect(iso(slots[0].startAt)).toBe('2026-05-02T11:30:00.000Z');
    expect(slots[0].endAt).toBe(slots[1].startAt);
    expect(iso(slots[1].endAt)).toBe('2026-05-02T13:00:00.000Z');
  });
  it('MUL-03 capacity 1: offsets -90, -45, 0 (A bake covered Sat 06:45)', () => {
    const p = planOf(abc(), 1);
    expect(iso(stepOf(p, 'A', 'bake1').startAt)).toBe('2026-05-02T10:45:00.000Z');
    expect(iso(stepOf(p, 'B', 'bake1').startAt)).toBe('2026-05-02T11:30:00.000Z');
    expect(iso(stepOf(p, 'C', 'bake1').startAt)).toBe(MAY2.starts.bake1);
  });
  it.each([[3], [5]])(
    'MUL-04/05 capacity %s: one slot, every schedule identical to the single-loaf plan',
    (cap) => {
      const p = planOf(abc(), cap);
      for (const id of ['A', 'B', 'C'])
        expect(iso(stepOf(p, id, 'feed').startAt)).toBe(MAY2.starts.feed);
      expect(p.slots).toHaveLength(1);
    },
  );
  it('MUL-06 four items cap 2: A,B at -45; C,D at 0', () => {
    const p = planOf([mk('A'), mk('B'), mk('C'), mk('D')], 2);
    expect(iso(stepOf(p, 'B', 'feed').startAt)).toBe(shifted('feed', -45));
    expect(iso(stepOf(p, 'D', 'feed').startAt)).toBe(MAY2.starts.feed);
  });
  it('MUL-07 five items cap 2: offsets -90, -45, 0', () => {
    const p = planOf(
      ['A', 'B', 'C', 'D', 'E'].map((x) => mk(x)),
      2,
    );
    expect(iso(stepOf(p, 'A', 'cool').endAt)).toBe(iso(READY - 90 * MIN));
    expect(iso(stepOf(p, 'C', 'cool').endAt)).toBe(iso(READY - 45 * MIN));
    expect(iso(stepOf(p, 'E', 'cool').endAt)).toBe(MAY2.readyUtc);
  });
  it('MUL-08 mixed bake lengths, cap 1, order [A, B]: B (35 min bake) is last and starts feeding Fri 03:15; A offset -35', () => {
    const short = { overrides: { bake1: 25, bake2: 10 } };
    const p = planOf([mk('A'), mk('B', 1, { durations: short })], 1);
    expect(iso(stepOf(p, 'B', 'feed').startAt)).toBe('2026-05-01T07:15:00.000Z');
    expect(iso(stepOf(p, 'A', 'feed').startAt)).toBe(shifted('feed', -35));
    expect(iso(stepOf(p, 'A', 'bake1').startAt)).toBe(shifted('bake1', -35));
    expect(stepOf(p, 'A', 'cool').endAt).toBe(READY - 35 * MIN);
  });
  it('MUL-09 input order decides the last slot: [B, A] makes A last', () => {
    const p = planOf([mk('B'), mk('A')], 1);
    expect(iso(stepOf(p, 'A', 'feed').startAt)).toBe(MAY2.starts.feed);
    expect(iso(stepOf(p, 'B', 'feed').startAt)).toBe(shifted('feed', -45));
  });
  it('MUL-10 each item keeps its own cold-ferment length', () => {
    const p = planOf([mk('A', 1, { durations: { overrides: { cold: 1080 } } }), mk('B')], 2);
    expect(stepOf(p, 'A', 'cold').durationMin).toBe(1080);
    expect(stepOf(p, 'B', 'cold').durationMin).toBe(720);
  });
  it('MUL-11 one item x3 loaves cap 2: shared dough steps once, oven and tail steps per slot (:s1, :s2)', () => {
    const p = planOf([mk('A', 3)], 2);
    expect(p.steps.filter((s: any) => s.stepId === 'feed')).toHaveLength(1);
    expect(
      p.steps
        .filter((s: any) => s.stepId === 'bake1')
        .map((s: any) => s.key)
        .sort(),
    ).toEqual(['A:bake1:s1', 'A:bake1:s2']);
    expect(stepOf(p, 'A', 'bake1', 1).loaves).toBe(2);
    expect(stepOf(p, 'A', 'bake1', 2).loaves).toBe(1);
    expect(iso(stepOf(p, 'A', 'feed').startAt)).toBe(shifted('feed', -45));
    expect(p.warnings.filter((w: any) => w.code === 'holdExceedsRange')).toEqual([]);
  });
  it('MUL-11b later loaves wait in the hold step: holdExceedsRange when 720 + 45 > maxMin', () => {
    const steps = defaultTemplate().map((s) => (s.id === 'cold' ? { ...s, maxMin: 750 } : s));
    const r = backward(bakeOf([mk('A', 3, { steps })], 2), READY, FAR_PAST);
    expect(r.plan.warnings).toContainEqual({
      code: 'holdExceedsRange',
      stepKey: 'A:cold',
      effectiveMin: 765,
      maxMin: 750,
    });
  });
  it.each([[0], [-1], [1.5]])('MUL-12 oven capacity %s is rejected', (cap) => {
    let r: any;
    try {
      r = planBake(bakeOf([mk('A')], cap), { mode: 'backward', readyAt: READY, now: FAR_PAST });
    } catch {
      return;
    }
    expect(r.status).toBe('invalid');
  });
  it('MUL-13 merged timeline sorted by start; ties broken deterministically', () => {
    const p = planOf(abc(), 2);
    const starts = p.steps.map((s: any) => s.startAt);
    expect(starts).toEqual([...starts].sort((a: number, b: number) => a - b));
    expect(planOf(abc(), 2).steps.map((s: any) => s.key)).toEqual(p.steps.map((s: any) => s.key));
  });
  it('MUL-14 quiet hours on the merged timeline: A, B and C feedings all warn, nothing moves', () => {
    const p = planOf(abc(), 2);
    const before = structuredClone(p);
    const ws = quietHoursWarnings(p, NIGHT, NY);
    expect(ws.map((w: any) => w.stepKey).sort()).toEqual(['A:feed', 'B:feed', 'C:feed']);
    expect(p).toEqual(before);
  });
  it('MUL-15 too soon is driven by the slot-1 recipes: earliest = now + 1855 + 45 min', () => {
    const now = ms(NOW_ISO);
    const earliest = ms('2026-05-02T23:40:00.000Z');
    const bad = backward(bakeOf(abc(), 2), earliest - 5 * MIN, now);
    expect(bad.status).toBe('tooSoon');
    expect(bad.earliestReadyAt).toBe(earliest);
    expect(backward(bakeOf(abc(), 2), earliest, now).status).toBe('ok');
  });
  it('reheatGapMin shifts earlier slots by the gap', () => {
    const r = backward(bakeOf(abc(), 2, { reheatGapMin: 20 }), READY, FAR_PAST);
    expect(iso(stepOf(r.plan, 'A', 'feed').startAt)).toBe(shifted('feed', -65));
  });
});
