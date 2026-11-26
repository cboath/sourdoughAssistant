import { describe, expect, it } from 'vitest';
import {
  assignOvenSlots,
  earliestReadyAt,
  planBake,
  planSpanMin,
  type BakePlan,
  type PlanInput,
  type PlanRequest,
} from './backward';
import { defaultTemplate } from './fixtures';
import { dstWarnings, localToUtc, utcToLocal } from './time';
import type { DurationOptions } from './durations';
import type { StepTemplate } from './validate';

const NY = 'America/New_York';
const MIN = 60_000;

function input(durations?: DurationOptions, steps: StepTemplate[] = defaultTemplate()): PlanInput {
  return {
    items: [{ itemId: 'a', label: 'Country', steps, loaves: 1, durations }],
    ovenCapacity: 1,
  };
}
function readyLocal(date: string, time: string, zone = NY) {
  return localToUtc({ date, time }, zone).at;
}
const FAR_PAST = 0;
function backward(inp: PlanInput, readyAt: number): BakePlan {
  const r = planBake(inp, { mode: 'backward', readyAt, now: FAR_PAST });
  if (r.status !== 'ok') throw new Error(JSON.stringify(r));
  return r.plan;
}
/** `Day HH:mm` local start of each step, keyed by step id. */
function locals(plan: BakePlan, zone = NY): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of plan.steps) {
    const l = utcToLocal(s.startAt, zone);
    out[s.stepId ?? 'preheat'] = `${l.date} ${l.time}`;
  }
  return out;
}

describe('backward pass, PRD default template (SCH-01)', () => {
  const plan = backward(input(), readyLocal('2026-05-02', '10:00'));

  it('matches the PRD schedule table', () => {
    expect(locals(plan)).toEqual({
      feed: '2026-05-01 03:05',
      mix: '2026-05-01 11:05',
      folds: '2026-05-01 12:05',
      bulk: '2026-05-01 14:05',
      shape: '2026-05-01 20:05',
      cold: '2026-05-01 20:15',
      preheat: '2026-05-02 07:45',
      bakeCovered: '2026-05-02 08:15',
      bakeUncovered: '2026-05-02 08:45',
      cool: '2026-05-02 09:00',
    });
  });

  it('UTC instants (SCH-01)', () => {
    const iso = (id: string) =>
      new Date(plan.steps.find((s) => s.stepId === id)!.startAt).toISOString();
    expect(iso('feed')).toBe('2026-05-01T07:05:00.000Z');
    expect(iso('cold')).toBe('2026-05-02T00:15:00.000Z');
    expect(plan.readyAt).toBe(Date.parse('2026-05-02T14:00:00Z'));
    expect(plan.startAt).toBe(Date.parse('2026-05-01T07:05:00Z'));
    expect(plan.mode).toBe('backward');
  });

  it('spans 1855 minutes and sequential steps abut (SCH-03)', () => {
    expect((plan.readyAt - plan.startAt) / MIN).toBe(1855);
    const seq = plan.steps.filter((s) => !s.isAlongside);
    for (let i = 1; i < seq.length; i++) expect(seq[i]!.startAt).toBe(seq[i - 1]!.endAt);
    expect(seq[seq.length - 1]!.endAt).toBe(plan.readyAt);
  });

  it('merges the preheat to bake:preheat, alongside, ending when Bake covered starts', () => {
    const pre = plan.steps.find((s) => s.key === 'bake:preheat')!;
    const cov = plan.steps.find((s) => s.stepId === 'bakeCovered')!;
    expect(pre).toMatchObject({
      itemId: null,
      stepId: null,
      isAlongside: true,
      name: 'Preheat oven',
      durationMin: 30,
    });
    expect(pre.endAt).toBe(cov.startAt);
  });

  it('keys, slot and loaves', () => {
    const keys = plan.steps.map((s) => s.key);
    expect(keys).toContain('a:feed');
    expect(keys).toContain('a:bakeCovered:s1');
    expect(keys).toContain('a:cool:s1');
    expect(plan.steps.find((s) => s.key === 'a:cool:s1')).toMatchObject({
      slotIndex: 1,
      loaves: 1,
    });
    expect(plan.steps.find((s) => s.key === 'a:feed')).toMatchObject({
      slotIndex: null,
      loaves: null,
    });
  });

  it('steps are sorted by start time', () => {
    for (let i = 1; i < plan.steps.length; i++)
      expect(plan.steps[i]!.startAt).toBeGreaterThanOrEqual(plan.steps[i - 1]!.startAt);
  });

  it('has one oven slot covering both bake steps', () => {
    expect(plan.slots).toEqual([
      {
        index: 1,
        startAt: Date.parse('2026-05-02T12:15:00Z'),
        endAt: Date.parse('2026-05-02T13:00:00Z'),
        loaves: [{ itemId: 'a', loaves: 1 }],
      },
    ]);
  });

  it('has no warnings by default', () => {
    expect(plan.warnings).toEqual([]);
  });

  it('is pure: same input twice, inputs untouched (SCH-18)', () => {
    const inp = input();
    const snapshot = JSON.stringify(inp);
    const a = backward(inp, readyLocal('2026-05-02', '10:00'));
    const b = backward(inp, readyLocal('2026-05-02', '10:00'));
    expect(a).toEqual(b);
    expect(JSON.stringify(inp)).toBe(snapshot);
  });

  it('PRD anchor: 3:05 AM Friday feeding', () => {
    expect(locals(backward(input(), readyLocal('2026-11-28', '10:00'))).feed).toBe(
      '2026-11-27 03:05',
    );
  });
});

describe('ranges and chosen values', () => {
  it('18 h cold ferment moves the feeding to 9:05 PM Thursday (SCH-02)', () => {
    const plan = backward(input({ overrides: { cold: 1080 } }), readyLocal('2026-11-28', '10:00'));
    expect(locals(plan)).toMatchObject({
      feed: '2026-11-26 21:05',
      mix: '2026-11-27 05:05',
      folds: '2026-11-27 06:05',
      bulk: '2026-11-27 08:05',
      shape: '2026-11-27 14:05',
      cold: '2026-11-27 14:15',
      preheat: '2026-11-28 07:45',
    });
    expect(plan.steps.find((s) => s.stepId === 'cold')).toMatchObject({
      durationMin: 1080,
      durationSource: 'user',
      minMin: 720,
      maxMin: 1440,
    });
  });

  it('bulk at max moves earlier steps 2 h earlier, later steps unchanged (SCH-07)', () => {
    const plan = backward(input({ overrides: { bulk: 480 } }), readyLocal('2026-05-02', '10:00'));
    const l = locals(plan);
    expect(l.feed).toBe('2026-05-01 01:05');
    expect(l.shape).toBe('2026-05-01 20:05');
  });

  it('every slider at its minimum (SCH-08)', () => {
    const overrides = Object.fromEntries(defaultTemplate().map((s) => [s.id, s.minMin]));
    const plan = backward(input({ overrides }), readyLocal('2026-05-02', '10:00'));
    expect(planSpanMin(input({ overrides }))).toEqual({ ok: true, value: 1600 });
    expect(locals(plan).feed).toBe('2026-05-01 07:20');
  });

  it('preheat at 45 min moves only the preheat (SCH-05)', () => {
    const plan = backward(input({ overrides: { preheat: 45 } }), readyLocal('2026-05-02', '10:00'));
    const l = locals(plan);
    expect(l.preheat).toBe('2026-05-02 07:30');
    expect(l.feed).toBe('2026-05-01 03:05');
    expect((plan.readyAt - plan.startAt) / MIN).toBe(1855);
  });

  it('preheat longer than the whole oven lead still works; alongside adds no time (SCH-04)', () => {
    const noPreheat = defaultTemplate().filter((s) => s.id !== 'preheat');
    const a = backward(input(undefined, noPreheat), readyLocal('2026-05-02', '10:00'));
    const b = backward(input(), readyLocal('2026-05-02', '10:00'));
    const rest: Record<string, string> = { ...locals(b) };
    delete rest.preheat;
    expect(locals(a)).toEqual(rest);
  });

  it('temperature adjustment shifts earlier steps and warns when clamped', () => {
    const plan = backward(input({ kitchenTempC: 18 }), readyLocal('2026-05-02', '10:00'));
    expect(plan.steps.find((s) => s.stepId === 'bulk')).toMatchObject({
      durationMin: 480,
      durationSource: 'temperature',
    });
    expect(plan.warnings).toEqual([
      { code: 'temperatureClamped', stepKey: 'a:bulk', minutes: 480, unclampedMinutes: 605 },
    ]);
    expect(locals(plan).feed).toBe('2026-05-01 01:05');
  });

  it('no warning when temperature is unclamped', () => {
    expect(
      backward(input({ kitchenTempC: 22 }), readyLocal('2026-05-02', '10:00')).warnings,
    ).toEqual([]);
  });

  it('returns invalid for an out-of-range override', () => {
    const r = planBake(input({ overrides: { cold: 1500 } }), {
      mode: 'backward',
      readyAt: 1e12,
      now: 0,
    });
    expect(r).toEqual({
      status: 'invalid',
      errors: [{ code: 'overrideOutOfRange', stepId: 'cold', minutes: 1500 }],
    });
  });

  it('returns invalid for an empty item list', () => {
    expect(
      planBake({ items: [], ovenCapacity: 1 }, { mode: 'backward', readyAt: 1, now: 0 }),
    ).toEqual({
      status: 'invalid',
      errors: [{ code: 'emptyRecipe' }],
    });
  });

  it('throws on programmer errors', () => {
    expect(() =>
      planBake({ ...input(), ovenCapacity: 0 }, { mode: 'backward', readyAt: 1, now: 0 }),
    ).toThrow();
  });
});

describe('alongside anchors', () => {
  const withAnchor = (anchor: StepTemplate['anchor']) =>
    defaultTemplate().map((s) => (s.id === 'preheat' ? { ...s, anchor } : s));
  const ready = readyLocal('2026-05-02', '10:00');
  const preheat = (steps: StepTemplate[]) =>
    backward(input(undefined, steps), ready).steps.find(
      (s) => s.stepId === 'preheat' || s.key === 'bake:preheat',
    )!;

  it('startsAtStart', () => {
    const s = preheat(
      withAnchor({ type: 'alongside', stepId: 'bakeCovered', align: 'startsAtStart' }),
    );
    expect(utcToLocal(s.startAt, NY).time).toBe('08:15');
  });

  it('endsAtEnd', () => {
    const s = preheat(withAnchor({ type: 'alongside', stepId: 'bakeCovered', align: 'endsAtEnd' }));
    expect(utcToLocal(s.endAt, NY).time).toBe('08:45');
  });

  it('applies offsetMin, negative meaning earlier', () => {
    const s = preheat(
      withAnchor({
        type: 'alongside',
        stepId: 'bakeCovered',
        align: 'endsAtStart',
        offsetMin: -10,
      }),
    );
    expect(utcToLocal(s.startAt, NY).time).toBe('07:35');
  });

  it('an alongside step before the chain start extends the plan start', () => {
    const steps = withAnchor({ type: 'alongside', stepId: 'feed', align: 'endsAtStart' }).map(
      (s) => (s.id === 'preheat' ? { ...s, kind: 'other' as const } : s),
    );
    const plan = backward(input(undefined, steps), ready);
    expect(plan.startAt).toBe(plan.steps.find((s) => s.stepId === 'preheat')!.startAt);
    expect(planSpanMin(input(undefined, steps))).toEqual({ ok: true, value: 1885 });
  });

  it('fails closed on alongside cycles and out-of-recipe anchors (SEC-01 M4)', () => {
    const base = defaultTemplate();
    const pre = base.find((s) => s.id === 'preheat')!;
    const cyc: StepTemplate[] = [
      ...base.filter((s) => s.id !== 'preheat'),
      { ...pre, id: 'A', anchor: { type: 'alongside', stepId: 'B', align: 'endsAtStart' } },
      { ...pre, id: 'B', anchor: { type: 'alongside', stepId: 'A', align: 'endsAtStart' } },
    ];
    const req: PlanRequest = { mode: 'backward', readyAt: ready, now: 0 };
    const r = planBake(input(undefined, cyc), req);
    expect(r.status).toBe('invalid');
    const outside = base.map((s) =>
      s.id === 'preheat'
        ? {
            ...s,
            anchor: { type: 'alongside' as const, stepId: 'zzz', align: 'endsAtStart' as const },
          }
        : s,
    );
    expect(planBake(input(undefined, outside), req)).toEqual({
      status: 'invalid',
      errors: [{ code: 'anchorMissing', stepId: 'preheat' }],
    });
    expect(planSpanMin(input(undefined, cyc)).ok).toBe(false);
    expect(earliestReadyAt(input(undefined, cyc), 0).ok).toBe(false);
  });
});

describe('fold sub-reminders (SCH-10)', () => {
  it('folds are at start + (i-1) x interval and bulk starts after the last interval', () => {
    const plan = backward(input(), readyLocal('2026-05-02', '10:00'));
    const f = plan.steps.find((s) => s.stepId === 'folds')!;
    expect(f.folds.map((x) => [x.index, utcToLocal(x.at, NY).time])).toEqual([
      [1, '12:05'],
      [2, '12:35'],
      [3, '13:05'],
      [4, '13:35'],
    ]);
    expect(utcToLocal(f.endAt, NY).time).toBe('14:05');
    expect(f).toMatchObject({ durationSource: 'derived', minMin: 120, maxMin: 120 });
  });

  it('fold count change follows count x interval (SCH-11)', () => {
    const steps = defaultTemplate().map((s) =>
      s.id === 'folds'
        ? { ...s, folds: { count: 3, intervalMin: 30 }, durationMin: 90, minMin: 90, maxMin: 90 }
        : s,
    );
    const plan = backward(input(undefined, steps), readyLocal('2026-05-02', '10:00'));
    expect(plan.steps.find((s) => s.stepId === 'folds')!.folds).toHaveLength(3);
    expect(locals(plan).feed).toBe('2026-05-01 03:35');
  });

  it('non-fold steps have no folds', () => {
    expect(backward(input(), 1e12).steps.find((s) => s.stepId === 'bulk')!.folds).toEqual([]);
  });
});

describe('forward "start now" (SCH-13)', () => {
  it('starts the first step at startAt and is ready 30 h 55 m later', () => {
    const now = readyLocal('2026-05-01', '12:00');
    const r = planBake(input(), { mode: 'forward', startAt: now, now });
    if (r.status !== 'ok') throw new Error('expected ok');
    expect(r.plan.mode).toBe('forward');
    expect(r.plan.steps[0]).toMatchObject({ stepId: 'feed', startAt: now });
    expect(utcToLocal(r.plan.readyAt, NY)).toMatchObject({ date: '2026-05-02', time: '18:55' });
  });

  it('forward and backward agree for the same ready time', () => {
    const start = readyLocal('2026-05-01', '12:00');
    const r = planBake(input(), { mode: 'forward', startAt: start, now: start });
    if (r.status !== 'ok') throw new Error('expected ok');
    const b = backward(input(), r.plan.readyAt);
    expect(r.plan.steps).toEqual(b.steps);
  });

  it('across spring forward: elapsed 1855 min (DST-07)', () => {
    const start = readyLocal('2026-03-07', '12:00');
    const r = planBake(input(), { mode: 'forward', startAt: start, now: start });
    if (r.status !== 'ok') throw new Error('expected ok');
    expect(new Date(r.plan.readyAt).toISOString()).toBe('2026-03-08T23:55:00.000Z');
    expect(utcToLocal(r.plan.readyAt, NY)).toMatchObject({ date: '2026-03-08', time: '19:55' });
  });

  it('across fall back (DST-08)', () => {
    const start = readyLocal('2026-10-31', '12:00');
    const r = planBake(input(), { mode: 'forward', startAt: start, now: start });
    if (r.status !== 'ok') throw new Error('expected ok');
    expect(new Date(r.plan.readyAt).toISOString()).toBe('2026-11-01T22:55:00.000Z');
    expect(utcToLocal(r.plan.readyAt, NY)).toMatchObject({ date: '2026-11-01', time: '17:55' });
  });
});

describe('too soon and earliest ready time (AMB-08)', () => {
  const now = readyLocal('2026-05-01', '12:00');
  const req = (readyAt: number): PlanRequest => ({ mode: 'backward', readyAt, now });

  it('exactly the earliest is accepted (SCH-14)', () => {
    const r = planBake(input(), req(readyLocal('2026-05-02', '18:55')));
    expect(r.status).toBe('ok');
  });

  it('1 minute too soon returns the earliest, rounded up to 5 min (SCH-15)', () => {
    const r = planBake(input(), req(readyLocal('2026-05-02', '18:54')));
    if (r.status !== 'tooSoon') throw new Error('expected tooSoon');
    expect(r.requestedReadyAt).toBe(readyLocal('2026-05-02', '18:54'));
    expect(r.earliestReadyAt).toBe(readyLocal('2026-05-02', '18:55'));
    expect(r.plan.readyAt).toBe(r.earliestReadyAt);
    expect(r.plan.startAt).toBeGreaterThanOrEqual(now);
  });

  it('ready time in the past (SCH-16)', () => {
    const r = planBake(input(), req(now - 3_600_000));
    if (r.status !== 'tooSoon') throw new Error('expected tooSoon');
    expect(r.earliestReadyAt).toBe(readyLocal('2026-05-02', '18:55'));
  });

  it('rounds up when now is not on a 5 minute boundary', () => {
    const odd = now + 2 * MIN; // 12:02
    const r = planBake(input(), { mode: 'backward', readyAt: 0, now: odd });
    if (r.status !== 'tooSoon') throw new Error('expected tooSoon');
    expect(utcToLocal(r.earliestReadyAt, NY).time).toBe('19:00'); // 12:02 + 30:55 = 18:57 -> 19:00
  });

  it('uses chosen durations, not minimums', () => {
    expect(earliestReadyAt(input(), now)).toEqual({
      ok: true,
      value: readyLocal('2026-05-02', '18:55'),
    });
    const overrides = Object.fromEntries(defaultTemplate().map((s) => [s.id, s.minMin]));
    expect(earliestReadyAt(input({ overrides }), now)).toEqual({
      ok: true,
      value: readyLocal('2026-05-02', '14:40'),
    });
  });

  it('counts a past alongside step as too soon', () => {
    // Preheat starts 30 min before the chain ends; make it start before the chain: anchored to feed.
    const steps = defaultTemplate().map((s) =>
      s.id === 'preheat'
        ? {
            ...s,
            kind: 'other' as const,
            anchor: { type: 'alongside' as const, stepId: 'feed', align: 'endsAtStart' as const },
          }
        : s,
    );
    const r = planBake(input(undefined, steps), req(readyLocal('2026-05-02', '18:55')));
    expect(r.status).toBe('tooSoon');
  });
});

describe('DST (ADR 0005 table)', () => {
  const total = 1855;
  it('spring forward: feeding Sat 02:05 EST, cold ferment 720 elapsed min (DST-01)', () => {
    const plan = backward(input(), readyLocal('2026-03-08', '10:00'));
    const l = locals(plan);
    expect(l.feed).toBe('2026-03-07 02:05');
    expect(l.cold).toBe('2026-03-07 19:15');
    expect(l.preheat).toBe('2026-03-08 07:45');
    expect(new Date(plan.startAt).toISOString()).toBe('2026-03-07T07:05:00.000Z');
    expect((plan.readyAt - plan.startAt) / MIN).toBe(total);
    const cold = plan.steps.find((s) => s.stepId === 'cold')!;
    expect(cold.endAt - cold.startAt).toBe(720 * MIN);
    expect(utcToLocal(cold.endAt, NY).time).toBe('08:15');
  });

  it('fall back: feeding Sat 04:05 EDT (DST-02)', () => {
    const plan = backward(input(), readyLocal('2026-11-01', '10:00'));
    expect(locals(plan).feed).toBe('2026-10-31 04:05');
    expect(new Date(plan.startAt).toISOString()).toBe('2026-10-31T08:05:00.000Z');
    expect(utcToLocal(plan.steps.find((s) => s.stepId === 'cold')!.startAt, NY).time).toBe('21:15');
  });

  it('London spring forward (DST-03)', () => {
    const plan = backward(input(), readyLocal('2026-03-29', '10:00', 'Europe/London'));
    expect(locals(plan, 'Europe/London').feed).toBe('2026-03-28 02:05');
  });

  it('zone independence without DST (SCH-19)', () => {
    const plan = backward(input(), readyLocal('2026-05-02', '10:00', 'Asia/Kolkata'));
    expect(locals(plan, 'Asia/Kolkata').feed).toBe('2026-05-01 03:05');
  });

  it('dstWarnings flags the step spanning the clock change', () => {
    const plan = backward(input(), readyLocal('2026-03-08', '10:00'));
    const w = dstWarnings(plan, NY);
    expect(w.length).toBeGreaterThan(0);
    expect(w).toContainEqual({ code: 'dstTransition', stepKey: 'a:cold', offsetChangeMin: 60 });
    expect(dstWarnings(backward(input(), readyLocal('2026-05-02', '10:00')), NY)).toEqual([]);
  });

  it('whole-year sweep: instants equal ready minus cumulative elapsed (DST-12)', () => {
    for (const zone of [NY, 'Europe/London', 'Asia/Kolkata', 'Australia/Lord_Howe']) {
      for (let day = 0; day < 365; day += 1) {
        const d = new Date(Date.UTC(2026, 0, 1 + day));
        const date = d.toISOString().slice(0, 10);
        const ready = readyLocal(date, '10:00', zone);
        const plan = backward(input(), ready);
        expect(plan.startAt).toBe(ready - total * MIN);
        const seq = plan.steps.filter((s) => !s.isAlongside);
        for (let i = 1; i < seq.length; i++)
          expect(seq[i]!.startAt).toBeGreaterThan(seq[i - 1]!.startAt);
      }
    }
  });
});

describe('assignOvenSlots (ADR 0009)', () => {
  it('3 loaves, capacity 2: slot 1 = 2, slot 2 = 1', () => {
    expect(assignOvenSlots([{ itemId: 'a', loaves: 3 }], 2)).toEqual([
      { index: 1, loaves: [{ itemId: 'a', loaves: 2 }] },
      { index: 2, loaves: [{ itemId: 'a', loaves: 1 }] },
    ]);
  });

  it('fills greedily in item order across items', () => {
    expect(
      assignOvenSlots(
        [
          { itemId: 'a', loaves: 1 },
          { itemId: 'b', loaves: 2 },
        ],
        2,
      ),
    ).toEqual([
      {
        index: 1,
        loaves: [
          { itemId: 'a', loaves: 1 },
          { itemId: 'b', loaves: 1 },
        ],
      },
      { index: 2, loaves: [{ itemId: 'b', loaves: 1 }] },
    ]);
  });

  it('capacity at or above the loaf count gives one slot; invalid input throws', () => {
    expect(assignOvenSlots([{ itemId: 'a', loaves: 3 }], 5)).toHaveLength(1);
    expect(() => assignOvenSlots([{ itemId: 'a', loaves: 3 }], 0)).toThrow();
    expect(() => assignOvenSlots([{ itemId: 'a', loaves: 1.5 }], 2)).toThrow();
  });
});

describe('several items in one oven slot', () => {
  const two: PlanInput = {
    items: [
      { itemId: 'a', label: 'Country', steps: defaultTemplate(), loaves: 1 },
      {
        itemId: 'b',
        label: 'Rye',
        steps: defaultTemplate(),
        loaves: 1,
        durations: { overrides: { cold: 1080 } },
      },
    ],
    ovenCapacity: 2,
  };

  it('shares one slot and one merged preheat; each item keeps its own pre-oven chain', () => {
    const plan = backward(two, readyLocal('2026-05-02', '10:00'));
    expect(plan.steps.filter((s) => s.kind === 'preheat')).toHaveLength(1);
    expect(plan.slots).toHaveLength(1);
    expect(plan.slots[0]!.loaves).toEqual([
      { itemId: 'a', loaves: 1 },
      { itemId: 'b', loaves: 1 },
    ]);
    const feedA = plan.steps.find((s) => s.key === 'a:feed')!;
    const feedB = plan.steps.find((s) => s.key === 'b:feed')!;
    expect(feedB.startAt).toBe(feedA.startAt - 360 * MIN);
    expect(feedA.name).toBe('Final starter feeding');
    expect(plan.startAt).toBe(feedB.startAt);
  });
});

describe('recipe without an oven phase', () => {
  it('runs the chain backward from the ready time (SCH-21)', () => {
    const steps = defaultTemplate()
      .filter((s) => s.id === 'cool')
      .map((s) => ({ ...s, kind: 'other' as const }));
    const plan = backward(input(undefined, steps), 10_000_000_000);
    expect(plan.steps[0]!.startAt).toBe(10_000_000_000 - 60 * MIN);
    expect(plan.slots).toEqual([]);
  });
});
