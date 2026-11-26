/* eslint-disable @typescript-eslint/no-explicit-any -- table-driven tests pass loosely typed fixtures */
/** QA-02: PRD schedule acceptance (core-cases section 5, core-api section 7). Fixed clock, explicit zones. */
import { describe, expect, it } from 'vitest';
import { validateSteps } from '../../src/schedule/validate';
import { chooseDurations } from '../../src/schedule/durations';
import { localToUtc } from '../../src/schedule/time';
import { backward, earliestReadyAt, forward, planSpanMin } from './support/plan';
import {
  CHAIN,
  deepFreeze,
  defaultTemplate,
  input,
  ITEM,
  iso,
  KOLKATA_MAY2,
  MAY2,
  MIN,
  ms,
  NOV28,
  NOV28_COLD18,
  NOW_ISO,
  startsByStep,
  stepOf,
  TOTAL_MIN,
  type Expected,
} from './support/fixtures';

// A "now" safely before every schedule below, so no plan is "too soon".
const FAR_PAST = ms('2025-01-01T00:00:00.000Z');

const okPlan = (r: any) => {
  expect(r.status).toBe('ok');
  return r.plan;
};

describe('SCH-01 / SCH-02 / SCH-19: PRD worked examples, exact UTC instants', () => {
  const cases: [string, Expected, Record<string, unknown>][] = [
    ['SCH-01 core-api section 7: Sat 2026-11-28 10:00 EST', NOV28, {}],
    ['SCH-01 PRD: Sat 2026-05-02 10:00 EDT', MAY2, {}],
    [
      'SCH-02 18 h cold ferment (overrides.cold = 1080)',
      NOV28_COLD18,
      { durations: { overrides: { cold: 1080 } } },
    ],
    ['SCH-19 Asia/Kolkata, same wall clock', KOLKATA_MAY2, {}],
  ];
  it.each(cases)('%s', (_n, exp, itemOver) => {
    // The ready instant is derived from local wall time through core, so a wrong zone shows up here too.
    const ready = localToUtc(exp.readyLocal, exp.zone);
    expect(iso(ready.at)).toBe(exp.readyUtc);
    expect(ready.adjustment).toBe('none');

    const plan = okPlan(backward(input({}, itemOver), ready.at, FAR_PAST));
    expect(plan.mode).toBe('backward');
    expect(iso(plan.readyAt)).toBe(exp.readyUtc);
    expect(startsByStep(plan)).toEqual(exp.starts);
    expect(iso(plan.startAt)).toBe(exp.starts.feed);
    expect(plan.warnings).toEqual([]);
  });

  it('SCH-02 feeding reads Thu 21:05 local and everything before cold moves 6 h earlier', () => {
    const plan = okPlan(
      backward(
        input({}, { durations: { overrides: { cold: 1080 } } }),
        ms(NOV28.readyUtc),
        FAR_PAST,
      ),
    );
    const a = startsByStep(okPlan(backward(input(), ms(NOV28.readyUtc), FAR_PAST)));
    const b = startsByStep(plan);
    for (const id of ['feed', 'mix', 'folds', 'bulk', 'shape', 'cold']) {
      expect(ms(a[id]!) - ms(b[id]!)).toBe(360 * MIN);
    }
    for (const id of ['preheat', 'bake1', 'bake2', 'cool']) expect(b[id]).toBe(a[id]);
  });
});

describe('SCH-03 .. SCH-08: structure and sliders', () => {
  const ready = ms(NOV28.readyUtc);
  const plan = () => okPlan(backward(input(), ready, FAR_PAST));

  it('SCH-03 each sequential step starts exactly when the previous ends; span = 1855 min', () => {
    const p = plan();
    let prevEnd: number | null = null;
    for (const [id, min] of CHAIN) {
      const s = stepOf(p, ITEM, id);
      if (prevEnd !== null) expect(s.startAt).toBe(prevEnd);
      expect(s.endAt - s.startAt).toBe(min * MIN);
      expect(s.durationMin).toBe(min);
      prevEnd = s.endAt;
    }
    expect(prevEnd).toBe(ready);
    expect(ready - p.startAt).toBe(TOTAL_MIN * MIN);
    expect(p.steps.map((s: any) => s.startAt)).toEqual(
      [...p.steps.map((s: any) => s.startAt)].sort((x, y) => x - y),
    );
  });

  it('SCH-04 alongside adds no time: removing preheat leaves every other start unchanged', () => {
    const withoutPreheat = defaultTemplate().filter((s) => s.id !== 'preheat');
    const a = startsByStep(plan());
    const b = startsByStep(okPlan(backward(input({}, { steps: withoutPreheat }), ready, FAR_PAST)));
    const { preheat, ...rest } = a;
    expect(preheat).toBeDefined();
    expect(b).toEqual(rest);
  });

  it('SCH-05 preheat at 45 min starts 07:30 and nothing else moves', () => {
    const a = startsByStep(plan());
    const b = startsByStep(
      okPlan(backward(input({}, { durations: { overrides: { preheat: 45 } } }), ready, FAR_PAST)),
    );
    expect(b.preheat).toBe('2026-11-28T12:30:00.000Z');
    expect({ ...b, preheat: '' }).toEqual({ ...a, preheat: '' });
  });

  it('SCH-06 preheat longer than the cold ferment hold is fine (preheat sits inside it)', () => {
    const p = okPlan(
      backward(input({}, { durations: { overrides: { preheat: 45 } } }), ready, FAR_PAST),
    );
    const cold = stepOf(p, ITEM, 'cold');
    const pre = stepOf(p, ITEM, 'preheat');
    expect(pre.startAt).toBeGreaterThanOrEqual(cold.startAt);
    expect(pre.endAt).toBeLessThanOrEqual(cold.endAt);
    expect(pre.isAlongside).toBe(true);
  });

  it('SCH-07 bulk at 8 h (max): earlier steps move 2 h earlier, later steps unchanged, feed Fri 01:05', () => {
    const p = okPlan(
      backward(input({}, { durations: { overrides: { bulk: 480 } } }), ready, FAR_PAST),
    );
    expect(startsByStep(p)).toMatchObject({
      feed: '2026-11-27T06:05:00.000Z',
      mix: '2026-11-27T14:05:00.000Z',
      folds: '2026-11-27T15:05:00.000Z',
      bulk: '2026-11-27T17:05:00.000Z',
      shape: NOV28.starts.shape,
      cold: NOV28.starts.cold,
      bake1: NOV28.starts.bake1,
    });
  });

  it('SCH-08 every slider at its minimum: span 26 h 40 min, feed Fri 07:20 EST', () => {
    const overrides = {
      feed: 360,
      mix: 30,
      bulk: 300,
      shape: 5,
      cold: 720,
      bake1: 25,
      bake2: 10,
      cool: 30,
    };
    const p = okPlan(backward(input({}, { durations: { overrides } }), ready, FAR_PAST));
    expect(ready - p.startAt).toBe(1600 * MIN);
    expect(startsByStep(p)).toMatchObject({
      feed: '2026-11-27T12:20:00.000Z',
      mix: '2026-11-27T18:20:00.000Z',
      folds: '2026-11-27T18:50:00.000Z',
      bulk: '2026-11-27T20:50:00.000Z',
      shape: '2026-11-28T01:50:00.000Z',
      cold: '2026-11-28T01:55:00.000Z',
      bake1: '2026-11-28T13:55:00.000Z',
      bake2: '2026-11-28T14:20:00.000Z',
      cool: '2026-11-28T14:30:00.000Z',
    });
  });

  it('SCH-09 override outside the range is a validation error, never clamped (AMB-19)', () => {
    for (const [stepId, minutes] of [
      ['cold', 1500],
      ['shape', 4],
      ['bulk', 481],
    ] as const) {
      const r = backward(
        input({}, { durations: { overrides: { [stepId]: minutes } } }),
        ready,
        FAR_PAST,
      );
      expect(r.status).toBe('invalid');
      expect(r.errors).toContainEqual({ code: 'overrideOutOfRange', stepId, minutes });
      expect(
        chooseDurations(defaultTemplate() as any, { overrides: { [stepId]: minutes } }),
      ).toMatchObject({
        ok: false,
      });
    }
  });

  it('every planned step reports its duration source and range', () => {
    const p = plan();
    const bulk = stepOf(p, ITEM, 'bulk');
    expect([bulk.minMin, bulk.maxMin, bulk.durationSource]).toEqual([300, 480, 'default']);
    expect(stepOf(p, ITEM, 'folds').durationSource).toBe('derived');
    const q = okPlan(
      backward(input({}, { durations: { overrides: { bulk: 400 } } }), ready, FAR_PAST),
    );
    expect(stepOf(q, ITEM, 'bulk').durationSource).toBe('user');
  });
});

describe('SCH-10 / SCH-11: fold reminders (AMB-05)', () => {
  const ready = ms(NOV28.readyUtc);
  it('SCH-10 four folds every 30 min from the step start; the step ends one interval after the last fold', () => {
    const p = okPlan(backward(input(), ready, FAR_PAST));
    const f = stepOf(p, ITEM, 'folds');
    expect(f.folds.map((x: any) => x.index)).toEqual([1, 2, 3, 4]);
    expect(f.folds.map((x: any) => iso(x.at))).toEqual([
      '2026-11-27T17:05:00.000Z', // 12:05 EST
      '2026-11-27T17:35:00.000Z',
      '2026-11-27T18:05:00.000Z',
      '2026-11-27T18:35:00.000Z', // 13:35 EST
    ]);
    expect(iso(f.endAt)).toBe('2026-11-27T19:05:00.000Z'); // bulk starts
    expect(stepOf(p, ITEM, 'bulk').startAt).toBe(f.endAt);
    expect(stepOf(p, ITEM, 'bulk').folds).toEqual([]);
  });
  it('SCH-11 three folds: duration follows count x interval, everything before moves 30 min later', () => {
    const steps = defaultTemplate().map((s) =>
      s.id === 'folds'
        ? { ...s, durationMin: 90, minMin: 90, maxMin: 90, folds: { count: 3, intervalMin: 30 } }
        : s,
    );
    const p = okPlan(backward(input({}, { steps }), ready, FAR_PAST));
    const f = stepOf(p, ITEM, 'folds');
    expect(f.durationMin).toBe(90);
    expect(f.folds).toHaveLength(3);
    expect(iso(stepOf(p, ITEM, 'feed').startAt)).toBe('2026-11-27T08:35:00.000Z'); // 30 min later than 08:05
    expect(iso(f.startAt)).toBe('2026-11-27T17:35:00.000Z');
  });
  it('foldDurationMismatch: stored duration that is not count x interval is invalid', () => {
    const steps = defaultTemplate().map((s) =>
      s.id === 'folds' ? { ...s, durationMin: 100, maxMin: 120 } : s,
    );
    expect(validateSteps(steps as any)).toMatchObject({ ok: false });
    expect(backward(input({}, { steps }), ready, FAR_PAST).status).toBe('invalid');
  });
});

describe('alongside anchors (AMB-06)', () => {
  // a(60) -> b(120) ends at ready T. x(30) alongside.
  const T = ms('2026-06-10T18:00:00.000Z');
  const mk = (anchor: any) =>
    input(
      {},
      {
        steps: [
          {
            id: 'a',
            name: 'a',
            kind: 'other',
            durationMin: 60,
            minMin: 30,
            maxMin: 90,
            tempSensitive: false,
            anchor: { type: 'sequential' },
            folds: null,
            notify: true,
          },
          {
            id: 'b',
            name: 'b',
            kind: 'other',
            durationMin: 120,
            minMin: 60,
            maxMin: 180,
            tempSensitive: false,
            anchor: { type: 'sequential' },
            folds: null,
            notify: true,
          },
          {
            id: 'x',
            name: 'x',
            kind: 'other',
            durationMin: 30,
            minMin: 10,
            maxMin: 60,
            tempSensitive: false,
            anchor,
            folds: null,
            notify: true,
          },
        ],
      },
    );
  const bStart = T - 120 * MIN;
  it.each([
    ['endsAtStart', { align: 'endsAtStart' }, bStart - 30 * MIN],
    ['startsAtStart', { align: 'startsAtStart' }, bStart],
    ['endsAtEnd', { align: 'endsAtEnd' }, T - 30 * MIN],
    ['endsAtStart with offset -10', { align: 'endsAtStart', offsetMin: -10 }, bStart - 40 * MIN],
  ])('%s', (_n, a, xStart) => {
    const p = okPlan(backward(mk({ type: 'alongside', stepId: 'b', ...a }), T, FAR_PAST));
    expect(stepOf(p, ITEM, 'x').startAt).toBe(xStart);
    expect(stepOf(p, ITEM, 'x').endAt - xStart).toBe(30 * MIN);
    expect(stepOf(p, ITEM, 'b').startAt).toBe(bStart);
    expect(p.readyAt).toBe(T);
  });
  it('an alongside step that starts before every sequential step moves plan.startAt (and counts for too-soon)', () => {
    const p = okPlan(
      backward(mk({ type: 'alongside', stepId: 'a', align: 'endsAtStart' }), T, FAR_PAST),
    );
    expect(p.startAt).toBe(T - 180 * MIN - 30 * MIN);
  });
});

describe('SCH-13 .. SCH-16: start now, earliest ready, too soon (AMB-08)', () => {
  const now = ms(NOW_ISO); // Fri 2026-05-01 12:00 EDT
  const earliest = ms('2026-05-02T22:55:00.000Z'); // Sat 18:55 EDT = now + 1855 min

  it('SCH-13 forward from now: feed starts now, ready Sat 18:55 EDT', () => {
    const p = okPlan(forward(input(), now));
    expect(p.mode).toBe('forward');
    expect(p.startAt).toBe(now);
    expect(stepOf(p, ITEM, 'feed').startAt).toBe(now);
    expect(p.readyAt).toBe(earliest);
  });
  it('planSpanMin and earliestReadyAt', () => {
    expect(planSpanMin(input())).toEqual({ ok: true, value: TOTAL_MIN });
    expect(earliestReadyAt(input(), now)).toEqual({ ok: true, value: earliest });
  });
  it('earliestReadyAt rounds UP to the next 5 minutes', () => {
    const r: any = earliestReadyAt(input(), now + 3 * MIN); // 22:58 -> 23:00
    expect(iso(r.value)).toBe('2026-05-02T23:00:00.000Z');
    expect(iso((earliestReadyAt(input(), now + 5 * MIN) as any).value)).toBe(
      '2026-05-02T23:00:00.000Z',
    );
  });
  it('SCH-14 ready time exactly the earliest is accepted', () => {
    const p = okPlan(backward(input(), earliest, now));
    expect(p.startAt).toBe(now);
  });
  it('SCH-15 one minute too soon: tooSoon with the full plan at earliestReadyAt', () => {
    const r = backward(input(), earliest - MIN, now);
    expect(r.status).toBe('tooSoon');
    expect(r.requestedReadyAt).toBe(earliest - MIN);
    expect(r.earliestReadyAt).toBe(earliest);
    expect(r.plan.readyAt).toBe(earliest);
    expect(r.plan.startAt).toBe(now);
  });
  it('SCH-15b earliest rounds up to the 5-min boundary when the shift is not a multiple', () => {
    const r = backward(input(), earliest - MIN, now + 3 * MIN); // needs 22:58 -> 23:00
    expect(r.status).toBe('tooSoon');
    expect(iso(r.earliestReadyAt)).toBe('2026-05-02T23:00:00.000Z');
    expect(r.plan.readyAt).toBe(r.earliestReadyAt);
  });
  it('SCH-16 ready time in the past behaves like too soon', () => {
    const r = backward(input(), now - 60 * MIN, now);
    expect(r.status).toBe('tooSoon');
    expect(r.earliestReadyAt).toBe(earliest);
  });
  it('SCH-17 earliest uses CHOSEN durations, not minimums (AMB-08)', () => {
    expect(iso((earliestReadyAt(input(), now) as any).value)).not.toBe('2026-05-02T18:40:00.000Z'); // minimum-based
    const mins = {
      feed: 360,
      mix: 30,
      bulk: 300,
      shape: 5,
      cold: 720,
      bake1: 25,
      bake2: 10,
      cool: 30,
    };
    const r: any = earliestReadyAt(input({}, { durations: { overrides: mins } }), now);
    expect(iso(r.value)).toBe('2026-05-02T18:40:00.000Z'); // 26 h 40 min
  });
});

describe('purity and validation', () => {
  const ready = ms(NOV28.readyUtc);
  it('SCH-18 same input twice gives identical output and the frozen input is not mutated', () => {
    const inp = deepFreeze(input());
    const a = backward(inp, ready, FAR_PAST);
    const b = backward(inp, ready, FAR_PAST);
    expect(b).toEqual(a);
  });
  it('SCH-20 zero-length step is rejected as rangeInvalid', () => {
    const steps = defaultTemplate().map((s) =>
      s.id === 'shape' ? { ...s, durationMin: 0, minMin: 0 } : s,
    );
    const r = backward(input({}, { steps }), ready, FAR_PAST);
    expect(r.status).toBe('invalid');
    expect(r.errors).toContainEqual({ code: 'rangeInvalid', stepId: 'shape' });
  });
  it('rangeInvalid when default is outside [min, max]', () => {
    const steps = defaultTemplate().map((s) => (s.id === 'mix' ? { ...s, durationMin: 200 } : s));
    expect(validateSteps(steps as any)).toEqual({
      ok: false,
      error: expect.arrayContaining([{ code: 'rangeInvalid', stepId: 'mix' }]),
    });
  });
  it('SCH-21 single step recipe (cool only): start = ready - 60 min', () => {
    const steps = defaultTemplate().filter((s) => s.id === 'cool');
    const p = okPlan(backward(input({}, { steps }), ready, FAR_PAST));
    expect(p.startAt).toBe(ready - 60 * MIN);
  });
  it('SCH-22 empty recipe', () => {
    const r = backward(input({}, { steps: [] }), ready, FAR_PAST);
    expect(r.status).toBe('invalid');
    expect(r.errors).toEqual([{ code: 'emptyRecipe' }]);
  });
  it('anchorMissing, alongsideChain, noSequentialSteps, ovenPhaseNotContiguous', () => {
    const t = defaultTemplate() as any[];
    const code = (steps: any[]) =>
      (validateSteps(steps) as any).error?.map((e: any) => e.code) ?? [];
    expect(
      code(
        t.map((s) =>
          s.id === 'preheat'
            ? { ...s, anchor: { type: 'alongside', stepId: 'ghost', align: 'endsAtStart' } }
            : s,
        ),
      ),
    ).toContain('anchorMissing');
    expect(
      code([
        ...t,
        {
          ...t[0],
          id: 'x2',
          kind: 'other',
          anchor: { type: 'alongside', stepId: 'preheat', align: 'endsAtStart' },
        },
      ]),
    ).toContain('alongsideChain');
    expect(
      code([{ ...t[6], anchor: { type: 'alongside', stepId: 'nope', align: 'endsAtStart' } }]),
    ).toContain('noSequentialSteps');
    const split = [...t.slice(0, 7), t[7], { ...t[9], id: 'gap', kind: 'other' }, t[8], t[9]];
    expect(code(split)).toContain('ovenPhaseNotContiguous');
    expect(validateSteps(t)).toEqual({ ok: true, value: undefined });
  });
});
