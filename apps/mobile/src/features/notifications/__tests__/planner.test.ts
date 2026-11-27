import { SENTINEL_ID } from '../constants';
import { planNotifications } from '../planner';
import type { PlannerInput } from '../types';
import { HOUR, MIN, T0, makeBake, overnightBake } from './fixtures';

const NOW = T0;
const input = (over: Partial<PlannerInput> & Pick<PlannerInput, 'bakes'>): PlannerInput => ({
  nowMs: NOW,
  zone: 'UTC',
  locale: 'en-US',
  platform: 'ios',
  exactAlarm: true,
  readyEnabled: false,
  ...over,
});

const find = (intents: ReturnType<typeof planNotifications>['intents'], suffix: string) =>
  intents.find((i) => i.id.endsWith(suffix));

describe('planNotifications: which notifications, at which times', () => {
  const bake = overnightBake({ startMs: NOW + HOUR });
  const { intents } = planNotifications(input({ bakes: [bake] }));
  const bakeId = bake.bake.id;

  it('emits a start for every notifying step, with deterministic ids', () => {
    const starts = intents.filter((i) => i.kind === 'start');
    expect(starts).toHaveLength(9);
    expect(starts.map((s) => s.id)).toContain(`sa1:${bakeId}:i:feed:start`);
    expect(starts.map((s) => s.id)).toContain(`sa1:${bakeId}:bake:preheat:start`);
    expect(find(intents, 'i:feed:start')!.fireAtMs).toBe(NOW + HOUR);
  });

  it('builds the start title and body from the step and recipe (screens-bake 11)', () => {
    const shape = find(intents, 'i:shape:start')!;
    expect(shape.title).toBe('Shape');
    expect(shape.body).toBe('Time to start · Country loaf');
  });

  it('merges fold 1 into the step start and adds folds 2 to n', () => {
    const fold1 = find(intents, 'i:fold:start')!;
    expect(fold1.title).toBe('Stretch and folds: fold 1 of 4');
    expect(fold1.body).toBe('Country loaf');
    const folds = intents.filter((i) => i.kind === 'fold');
    expect(folds.map((f) => f.id.split(':').pop())).toEqual(['2', '3', '4']);
    expect(folds.map((f) => f.fireAtMs - fold1.fireAtMs)).toEqual([30 * MIN, 60 * MIN, 90 * MIN]);
    expect(folds[0]!.title).toBe('Stretch and folds: fold 2 of 4');
  });

  it('adds a heads-up headsUpMin before each start', () => {
    const feed = find(intents, 'i:feed:headsup')!;
    expect(feed.fireAtMs).toBe(NOW + HOUR - 10 * MIN);
    expect(feed.title).toBe('In 10 min: Final starter feeding');
    expect(feed.body).toBe('Country loaf');
    expect(intents.filter((i) => i.kind === 'headsup')).toHaveLength(9);
  });

  it('puts start and fold on time-sensitive and heads-ups on active (iOS), with no channel', () => {
    expect(find(intents, 'i:feed:start')!.interruptionLevel).toBe('timeSensitive');
    expect(find(intents, 'i:fold:fold:2')!.interruptionLevel).toBe('timeSensitive');
    expect(find(intents, 'i:feed:headsup')!.interruptionLevel).toBe('active');
    expect(intents.every((i) => i.channelId === undefined && i.delivery === undefined)).toBe(true);
    expect(intents.every((i) => i.threadId === bakeId)).toBe(true);
  });

  it('carries a payload with the ids needed to deep-link, and no names or notes', () => {
    const shape = find(intents, 'i:shape:start')!;
    expect(shape.data).toMatchObject({ v: 1, kind: 'start', bakeId, stepKey: 'i:shape' });
    expect(shape.data.bakeStepId).toBe(bake.steps.find((s) => s.stepKey === 'i:shape')!.id);
    expect(JSON.stringify(shape.data)).not.toMatch(/Country|Shape|SECRET|PRIVATE/);
  });

  it('is sorted by fire time and deterministic', () => {
    const times = intents.map((i) => i.fireAtMs);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(planNotifications(input({ bakes: [bake] })).intents).toEqual(intents);
  });
});

describe('planNotifications: step status and bake status', () => {
  const steps = (status: 'pending' | 'active' | 'done' | 'skipped') => ({
    key: 'i:fold',
    name: 'Stretch and folds',
    kind: 'fold' as const,
    startMs: NOW + HOUR,
    durationMin: 120,
    status,
    folds: { count: 4, intervalMin: 30 },
  });
  const plan = (bake: ReturnType<typeof makeBake>) =>
    planNotifications(input({ bakes: [bake] })).intents;

  it('skips done, skipped and notify=false steps', () => {
    expect(plan(makeBake({ steps: [steps('done')] }))).toHaveLength(0);
    expect(plan(makeBake({ steps: [steps('skipped')] }))).toHaveLength(0);
    expect(
      plan(makeBake({ steps: [{ ...steps('pending'), notify: false, folds: undefined }] })),
    ).toHaveLength(0);
  });

  it('an active fold step has started: no start or heads-up, only remaining folds', () => {
    const intents = plan(makeBake({ steps: [steps('active')] }));
    expect(intents.map((i) => i.kind)).toEqual(['fold', 'fold', 'fold']);
  });

  it('re-anchors later folds from the last recorded fold time', () => {
    const early = NOW + HOUR + 20 * MIN;
    const intents = plan(
      makeBake({
        steps: [
          {
            ...steps('active'),
            folds: { count: 4, intervalMin: 30, done: 2, foldTimes: [NOW + HOUR, early] },
          },
        ],
      }),
    );
    expect(intents.map((i) => i.id.split(':').pop())).toEqual(['3', '4']);
    expect(intents.map((i) => i.fireAtMs)).toEqual([early + 30 * MIN, early + 60 * MIN]);
  });

  it('only scheduled and active bakes produce notifications', () => {
    const base = { steps: [{ key: 'i:a', name: 'Shape', startMs: NOW + HOUR, durationMin: 30 }] };
    expect(plan(makeBake({ ...base, status: 'scheduled' })).length).toBeGreaterThan(0);
    expect(plan(makeBake({ ...base, status: 'active' })).length).toBeGreaterThan(0);
    expect(plan(makeBake({ ...base, status: 'cancelled' }))).toHaveLength(0);
    expect(plan(makeBake({ ...base, status: 'completed' }))).toHaveLength(0);
  });

  it('never schedules intents at or before now + 5 s, but keeps a start whose heads-up passed', () => {
    const bake = makeBake({
      steps: [
        { key: 'i:past', name: 'Past', startMs: NOW + 4_000, durationMin: 10 },
        { key: 'i:soon', name: 'Soon', startMs: NOW + 5 * MIN, durationMin: 10 },
      ],
    });
    const intents = plan(bake);
    expect(intents.map((i) => i.id.split(':').slice(2).join(':'))).toEqual(['i:soon:start']);
  });

  it('skips heads-ups when headsUpMin is 0', () => {
    const bake = makeBake({
      headsUpMin: 0,
      steps: [{ key: 'i:a', name: 'Shape', startMs: NOW + HOUR, durationMin: 30 }],
    });
    expect(plan(bake).map((i) => i.kind)).toEqual(['start']);
  });
});

describe('planNotifications: quiet hours', () => {
  it('does not suppress or downgrade steps that start inside quiet hours (ADR 0010 section 5)', () => {
    // 03:05 UTC, inside the default 22:00 to 06:00 window.
    const bake = makeBake({
      steps: [
        {
          key: 'i:feed',
          name: 'Final starter feeding',
          startMs: NOW + 3 * HOUR + 5 * MIN,
          durationMin: 60,
        },
      ],
    });
    const { intents } = planNotifications(input({ bakes: [bake] }));
    const start = intents.find((i) => i.kind === 'start')!;
    expect(start.fireAtMs).toBe(NOW + 3 * HOUR + 5 * MIN);
    expect(start.interruptionLevel).toBe('timeSensitive');
    expect(intents.some((i) => i.kind === 'headsup')).toBe(true);
  });
});

describe('planNotifications: coalescing', () => {
  it('merges starts of one bake that fire in the same minute (id from the earliest step key)', () => {
    const bake = makeBake({
      recipes: ['Country loaf', 'Whole wheat'],
      steps: [
        { key: 'b:shape', name: 'Shape', startMs: NOW + HOUR, durationMin: 30, itemIndex: 1 },
        {
          key: 'a:mix',
          name: 'Mix and rest',
          startMs: NOW + HOUR + 20_000,
          durationMin: 30,
          itemIndex: 0,
        },
        { key: 'c:later', name: 'Later', startMs: NOW + 2 * HOUR, durationMin: 30 },
      ],
    });
    const starts = planNotifications(input({ bakes: [bake] })).intents.filter(
      (i) => i.kind === 'start',
    );
    expect(starts).toHaveLength(2);
    const merged = starts[0]!;
    expect(merged.id).toBe(`sa1:${bake.bake.id}:b:shape:start`);
    expect(merged.title).toBe('2 steps now');
    expect(merged.body).toBe('Shape (Whole wheat (B)), Mix and rest (Country loaf (A))');
    expect(merged.data.bakeStepIds).toHaveLength(2);
  });

  it('does not merge across bakes', () => {
    const mk = () =>
      makeBake({ steps: [{ key: 'i:a', name: 'Shape', startMs: NOW + HOUR, durationMin: 30 }] });
    const starts = planNotifications(input({ bakes: [mk(), mk()] })).intents.filter(
      (i) => i.kind === 'start',
    );
    expect(starts).toHaveLength(2);
  });
});

describe('planNotifications: lock-screen content', () => {
  it('never includes notes, and cleans and caps names at 100 characters', () => {
    const long = `Smith\u202E wedding\u0007 ${'x'.repeat(200)}`;
    const bake = makeBake({
      recipes: [long],
      steps: [{ key: 'i:a', name: 'Shape', startMs: NOW + HOUR, durationMin: 30 }],
    });
    const { intents } = planNotifications(input({ bakes: [bake] }));
    for (const i of intents) {
      expect(Array.from(i.title).length).toBeLessThanOrEqual(100);
      expect(Array.from(i.body).length).toBeLessThanOrEqual(100);
      const text = `${i.title}${i.body}`;
      expect(text).not.toContain(String.fromCharCode(0x202e));
      expect(text).not.toContain(String.fromCharCode(7));
      expect(text).not.toMatch(/SECRET|PRIVATE/);
    }
    const body = intents.find((i) => i.kind === 'start')!.body;
    expect(body.endsWith('…')).toBe(true);
  });

  it('labels recipes A to D in a multi-recipe bake', () => {
    const bake = makeBake({
      recipes: ['Country loaf', 'Whole wheat'],
      steps: [{ key: 'i:a', name: 'Shape', startMs: NOW + HOUR, durationMin: 30, itemIndex: 1 }],
    });
    const start = planNotifications(input({ bakes: [bake] })).intents.find(
      (i) => i.kind === 'start',
    )!;
    expect(start.body).toBe('Time to start · Whole wheat (B)');
  });

  it('uses the recipe list for bake-wide steps', () => {
    const bake = makeBake({
      recipes: ['Country loaf', 'Whole wheat'],
      steps: [
        {
          key: 'bake:preheat',
          name: 'Preheat oven',
          startMs: NOW + HOUR,
          durationMin: 30,
          itemIndex: null,
        },
      ],
    });
    const start = planNotifications(input({ bakes: [bake] })).intents.find(
      (i) => i.kind === 'start',
    )!;
    expect(start.body).toBe('Time to start · Country loaf, Whole wheat');
  });

  it('appends the ready day and time when two live bakes share a recipe', () => {
    const mk = (readyMs: number) =>
      makeBake({
        readyMs,
        steps: [{ key: 'i:a', name: 'Shape', startMs: NOW + HOUR, durationMin: 30 }],
      });
    const { intents } = planNotifications(
      input({ bakes: [mk(Date.UTC(2026, 10, 28, 10, 0)), mk(Date.UTC(2026, 10, 29, 10, 0))] }),
    );
    const bodies = intents.filter((i) => i.kind === 'start').map((i) => i.body);
    expect(bodies).toEqual(
      expect.arrayContaining([
        'Time to start · Country loaf, ready Sat 10:00 AM',
        'Time to start · Country loaf, ready Sun 10:00 AM',
      ]),
    );
  });
});

describe('planNotifications: Android delivery', () => {
  const bake = overnightBake({ startMs: NOW + HOUR });
  const plan = (exactAlarm: boolean) =>
    planNotifications(input({ bakes: [bake], platform: 'android', exactAlarm })).intents;

  it('uses the steps channel with alarmClock for start and fold when exact alarms are allowed', () => {
    const intents = plan(true);
    const start = find(intents, 'i:feed:start')!;
    expect(start).toMatchObject({ channelId: 'bake-steps-v1', delivery: 'alarmClock' });
    expect(find(intents, 'i:fold:fold:2')).toMatchObject({ delivery: 'alarmClock' });
    expect(find(intents, 'i:feed:headsup')).toMatchObject({
      channelId: 'bake-headsup-v1',
      delivery: 'bestEffort',
    });
    expect(intents.every((i) => i.interruptionLevel === undefined)).toBe(true);
  });

  it('falls back to bestEffort when exact alarms are denied, which changes the hash', () => {
    const allowed = find(plan(true), 'i:feed:start')!;
    const denied = find(plan(false), 'i:feed:start')!;
    expect(denied.delivery).toBe('bestEffort');
    expect(denied.data.hash).not.toBe(allowed.data.hash);
  });
});

describe('planNotifications: ready kind (B8, flag off by default)', () => {
  const bake = overnightBake({ startMs: NOW + HOUR });

  it('emits no ready intents while the flag is off', () => {
    const { intents } = planNotifications(input({ bakes: [bake] }));
    expect(intents.some((i) => i.kind === 'ready')).toBe(false);
  });

  it('emits one per item at the end of Cool when on, as a non-critical active intent', () => {
    const { intents } = planNotifications(input({ bakes: [bake], readyEnabled: true }));
    const ready = intents.filter((i) => i.kind === 'ready');
    expect(ready).toHaveLength(1);
    const cool = bake.steps.find((s) => s.kind === 'cool')!;
    expect(ready[0]).toMatchObject({
      id: `sa1:${bake.bake.id}:${bake.items[0]!.id}:ready`,
      fireAtMs: Date.parse(cool.plannedEndAt),
      title: 'Ready to eat',
      interruptionLevel: 'active',
    });
    expect(ready[0]!.data.bakeStepId).toBe(cool.id);
  });
});

describe('planNotifications: budget', () => {
  const bakesFor = (count: number) =>
    Array.from({ length: count }, (_, k) => overnightBake({ startMs: NOW + HOUR + k * 7 * MIN }));

  it('a single bake fits entirely', () => {
    const { intents, trimmed } = planNotifications(input({ bakes: bakesFor(1) }));
    expect(intents).toHaveLength(9 + 3 + 9);
    expect(trimmed).toEqual({ critical: 0, other: 0 });
  });

  it('three bakes keep every critical intent and trim the latest heads-ups to 60', () => {
    const bakes = bakesFor(3);
    const { intents, trimmed } = planNotifications(input({ bakes }));
    const critical = intents.filter((i) => i.kind === 'start' || i.kind === 'fold');
    expect(critical).toHaveLength(36);
    expect(intents).toHaveLength(60);
    expect(intents.some((i) => i.id === SENTINEL_ID)).toBe(false);
    expect(trimmed).toEqual({ critical: 0, other: 3 });
    const all = planNotifications(input({ bakes, budget: 1000 })).intents;
    const dropped = all.filter((a) => !intents.some((i) => i.id === a.id));
    const lastKept = Math.max(
      ...intents.filter((i) => i.kind === 'headsup').map((i) => i.fireAtMs),
    );
    expect(dropped.every((d) => d.kind === 'headsup' && d.fireAtMs >= lastKept)).toBe(true);
  });

  it('five bakes overflow: 59 critical, one sentinel before the horizon, no later heads-ups', () => {
    const { intents, trimmed } = planNotifications(input({ bakes: bakesFor(5) }));
    const critical = intents.filter((i) => i.kind === 'start' || i.kind === 'fold');
    expect(critical).toHaveLength(59);
    const sentinel = intents.filter((i) => i.id === SENTINEL_ID);
    expect(sentinel).toHaveLength(1);
    const horizon = Math.max(...critical.map((i) => i.fireAtMs));
    expect(sentinel[0]!.fireAtMs).toBe(horizon - MIN);
    expect(sentinel[0]).toMatchObject({
      kind: 'topup',
      title: 'Keep your reminders coming',
      interruptionLevel: 'active',
    });
    expect(intents.filter((i) => i.kind === 'headsup').every((i) => i.fireAtMs <= horizon)).toBe(
      true,
    );
    // 60 budget plus the sentinel stays under the iOS cap of 64.
    expect(intents.length).toBeLessThanOrEqual(61);
    expect(trimmed.critical).toBe(60 - 59);
  });

  it('never lets a heads-up displace a start or fold', () => {
    const bakes = bakesFor(5);
    const { intents } = planNotifications(input({ bakes, budget: 20 }));
    const critical = intents.filter((i) => i.kind === 'start' || i.kind === 'fold');
    expect(critical).toHaveLength(19);
    const earliestLeftOut = planNotifications(input({ bakes, budget: 1000 })).intents.filter(
      (i) => (i.kind === 'start' || i.kind === 'fold') && !critical.some((c) => c.id === i.id),
    );
    expect(Math.min(...earliestLeftOut.map((i) => i.fireAtMs))).toBeGreaterThanOrEqual(
      Math.max(...critical.map((c) => c.fireAtMs)),
    );
  });

  it('pushes the sentinel past now + 5 s when the horizon is imminent', () => {
    const bakes = [
      makeBake({
        steps: Array.from({ length: 5 }, (_, i) => ({
          key: `i:s${i}`,
          name: `S${i}`,
          startMs: NOW + 10_000 + i * 2 * MIN,
          durationMin: 1,
        })),
      }),
    ];
    const { intents } = planNotifications(input({ bakes, budget: 2 }));
    const sentinel = intents.find((i) => i.id === SENTINEL_ID)!;
    expect(sentinel.fireAtMs).toBeGreaterThan(NOW + 5_000);
  });

  it('Android uses a budget of 150', () => {
    const { intents } = planNotifications(input({ bakes: bakesFor(5), platform: 'android' }));
    expect(intents).toHaveLength(5 * 21);
    expect(intents.some((i) => i.id === SENTINEL_ID)).toBe(false);
  });
});
