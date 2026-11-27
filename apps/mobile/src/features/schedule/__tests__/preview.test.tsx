import { toIso } from '@sourdough/core';
import { buildPreview, sanitizeOverrides } from '../preview';
import { findOverlaps } from '../overlap';
import { buildTimeline } from '../timeline';
import {
  COUNTRY,
  NOW,
  ZONE,
  QUIET,
  previewInput,
  previewItem,
  recipeById,
  seededDb,
} from './helpers';
import type { TestDb } from '../../../db/test-utils';

let db: TestDb;
beforeAll(async () => {
  db = await seededDb();
});

const ctx = (extra = {}) => ({
  time: { zone: ZONE, locale: 'en-US', now: NOW },
  unit: 'C' as const,
  kitchenTempC: null,
  quiet: QUIET,
  expandedFolds: new Set<string>(),
  ...extra,
});

describe('buildPreview: the PRD worked example (screens-bake.md 3.3)', () => {
  it('plans Fri 3:05 AM to Sat 10:00 AM with one quiet-hours warning', async () => {
    const item = previewItem(await recipeById(db, COUNTRY));
    const preview = buildPreview(previewInput([item]));
    expect(preview.status).toBe('ok');
    const plan = preview.plan!;
    expect(preview.spanMin).toBe(30 * 60 + 55);
    const first = plan.steps[0]!;
    expect(first.name).toBe('Final starter feeding');
    const time = (at: number) =>
      new Intl.DateTimeFormat('en-US', {
        timeStyle: 'short',
        dateStyle: 'short',
        timeZone: ZONE,
      }).format(at);
    expect(time(first.startAt)).toBe('11/27/26, 3:05 AM');
    expect(time(plan.readyAt)).toBe('11/28/26, 10:00 AM');
    expect(preview.warnings.filter((w) => w.code === 'quietHours')).toHaveLength(1);
  });

  it('a longer cold ferment (18 h) moves the feeding out of quiet hours', async () => {
    // Spec gap: screens-bake.md 3.3 says the quiet-hours line disappears at 18 h. Core is right and
    // the doc is not: the feeding moves to Thu 9:05 PM, but "Mix and rest" then starts Fri 5:05 AM,
    // which is inside 10 PM to 6 AM. The warning moves to that step.
    const aggregate = await recipeById(db, COUNTRY);
    const cold = aggregate.steps.find((s) => s.kind === 'coldProof')!;
    const preview = buildPreview(
      previewInput([previewItem(aggregate, 'item-a', 1, { [cold.id]: 1080 })]),
    );
    const flagged = preview.warnings.flatMap((w) => (w.code === 'quietHours' ? [w.stepKey] : []));
    expect(flagged).toEqual([`item-a:${aggregate.steps.find((s) => s.kind === 'mix')!.id}`]);
    expect(preview.choices[0]![cold.id]).toMatchObject({ minutes: 1080, source: 'user' });
    expect(preview.baseChoices[0]![cold.id]).toMatchObject({ minutes: 720, source: 'default' });
  });

  it('is too soon when the ready time is tomorrow, with the earliest time and a plan to show', async () => {
    const item = previewItem(await recipeById(db, COUNTRY));
    const preview = buildPreview(
      previewInput([item], { readyLocal: { date: '2026-11-27', time: '10:00' } }),
    );
    expect(preview.status).toBe('tooSoon');
    expect(preview.earliestReadyAt).toBeGreaterThan(NOW);
    expect(preview.plan?.readyAt).toBe(preview.earliestReadyAt);
    // Shortest times (every range at its minimum) can't fit a 30 h bake into 25 h.
    expect(preview.shortestFits).toBe(false);
  });

  it('offers "Use shortest times" when that fits the requested time', async () => {
    const item = previewItem(await recipeById(db, COUNTRY));
    // Thu 9 AM now. The default plan needs 30 h 55 min, every range at its minimum 26 h 40 min:
    // Fri 1 PM (28 h away) is too soon at the default times but fits with the shortest.
    const preview = buildPreview(
      previewInput([item], { readyLocal: { date: '2026-11-27', time: '13:00' } }),
    );
    expect(preview.status).toBe('tooSoon');
    expect(preview.shortestFits).toBe(true);
    const replan = buildPreview(
      previewInput([{ ...item, overrides: preview.shortestOverrides[0]! }], {
        readyLocal: { date: '2026-11-27', time: '13:00' },
      }),
    );
    expect(replan.status).toBe('ok');
  });

  it('start now ignores the ready time and plans forward from now', async () => {
    const item = previewItem(await recipeById(db, COUNTRY));
    const preview = buildPreview(previewInput([item], { mode: 'forward', readyLocal: null }));
    expect(preview.status).toBe('ok');
    expect(preview.plan?.startAt).toBe(NOW);
    expect(toIso(preview.plan!.readyAt)).toBe(toIso(NOW + (30 * 60 + 55) * 60_000));
  });

  it('reports no ready time before the default is picked', async () => {
    const item = previewItem(await recipeById(db, COUNTRY));
    expect(buildPreview(previewInput([item], { readyLocal: null })).status).toBe('noReadyTime');
  });

  it('a kitchen temperature adjusts bulk ferment and the slider value beats it', async () => {
    const aggregate = await recipeById(db, COUNTRY);
    const bulk = aggregate.steps.find((s) => s.kind === 'bulk')!;
    const warm = buildPreview(previewInput([previewItem(aggregate)], { kitchenTempC: 27 }));
    expect(warm.choices[0]![bulk.id]!.source).toBe('temperature');
    expect(warm.choices[0]![bulk.id]!.minutes).toBeLessThan(360);
    const chosen = buildPreview(
      previewInput([previewItem(aggregate, 'item-a', 1, { [bulk.id]: 400 })], { kitchenTempC: 27 }),
    );
    expect(chosen.choices[0]![bulk.id]).toMatchObject({ minutes: 400, source: 'user' });
  });

  it('ignores stale or out-of-range slider values instead of failing', async () => {
    const aggregate = await recipeById(db, COUNTRY);
    const bulk = aggregate.steps.find((s) => s.kind === 'bulk')!;
    const item = previewItem(aggregate, 'item-a', 1, { [bulk.id]: 9999, gone: 10 });
    expect(buildPreview(previewInput([item])).status).toBe('ok');
    expect(sanitizeOverrides(item.steps, item.overrides)).toEqual({});
  });

  it('attributes a recipe with no steps to that recipe', async () => {
    const aggregate = await recipeById(db, COUNTRY);
    const empty = { ...previewItem(aggregate), steps: [] };
    const preview = buildPreview(previewInput([empty]));
    expect(preview.status).toBe('invalid');
    expect(preview.errors).toEqual([{ itemIndex: 0, error: { code: 'emptyRecipe' } }]);
  });

  it('three loaves in a two-loaf oven make two back-to-back slots', async () => {
    const preview = buildPreview(
      previewInput([previewItem(await recipeById(db, COUNTRY), 'item-a', 3)]),
    );
    expect(preview.plan?.slots.map((s) => s.loaves[0]?.loaves)).toEqual([2, 1]);
    const slot2 = preview.plan!.slots[1]!;
    // B1: the last slot is ready at the ready time (its cool step ends there).
    expect(slot2.endAt).toBeLessThanOrEqual(preview.plan!.readyAt);
  });
});

describe('merged multi-recipe plan', () => {
  it('names slots by letter and flags simultaneous steps across recipes', async () => {
    const a = previewItem(await recipeById(db, COUNTRY), 'item-a', 2);
    const b = previewItem(
      await recipeById(db, '5eed0003-0000-4000-8000-000000000002'),
      'item-b',
      1,
    );
    const preview = buildPreview(previewInput([a, b], { ovenCapacity: 3 }));
    expect(preview.status).toBe('ok');
    // Same default process, so every step of A starts together with B's.
    expect(preview.overlaps.length).toBeGreaterThan(0);
    const model = buildTimeline(
      preview,
      [a, b].map((i) => ({ itemId: i.itemId, name: i.name, steps: i.steps, loaves: i.loaves })),
      ctx(),
    );
    const slot = model.rows.find((r) => r.type === 'slot');
    expect(slot).toMatchObject({ text: expect.stringMatching(/^Oven slot 1 · A ×2, B ×1 · /) });
    expect(model.warningLines.some((l) => l.kind === 'overlap')).toBe(true);
    const first = model.rows.find((r) => r.type === 'step');
    expect(first).toMatchObject({ letter: expect.stringMatching(/^[AB]$/) });
  });
});

describe('findOverlaps', () => {
  const step = (
    key: string,
    itemId: string | null,
    startAt: number,
    slotIndex: number | null = null,
  ) => ({ key, itemId, startAt, slotIndex }) as never;
  it('pairs different items within 10 minutes, never the same item or the same oven slot', () => {
    const min = 60_000;
    expect(
      findOverlaps([
        step('a', 'x', 0),
        step('b', 'y', 9 * min),
        step('c', 'x', 5 * min),
        step('d', 'y', 11 * min + 1),
      ]),
    ).toEqual([
      { a: 'a', b: 'b' },
      { a: 'c', b: 'b' },
      { a: 'c', b: 'd' },
    ]);
    expect(findOverlaps([step('a', 'x', 0, 1), step('b', 'y', 0, 1)])).toEqual([]);
    expect(findOverlaps([step('a', 'x', 0, 1), step('b', 'y', 0, 2)])).toHaveLength(1);
    expect(findOverlaps([step('a', null, 0), step('b', 'y', 3 * min)])).toHaveLength(1);
  });
});

describe('buildTimeline: the PRD table', () => {
  it('has day headers, the right rows and the quiet-hours tag on the feeding', async () => {
    const item = previewItem(await recipeById(db, COUNTRY));
    const preview = buildPreview(previewInput([item]));
    const model = buildTimeline(
      preview,
      [{ itemId: item.itemId, name: item.name, steps: item.steps, loaves: 1 }],
      ctx(),
    );
    const outline = model.rows.map((r) =>
      r.type === 'step' ? `${r.time} ${r.name}` : r.type === 'day' ? r.text : r.type,
    );
    expect(outline).toEqual([
      'Friday, November 27',
      '3:05 AM Final starter feeding',
      '11:05 AM Mix and rest',
      '12:05 PM Stretch and folds',
      '2:05 PM Bulk ferment',
      '8:05 PM Shape',
      '8:15 PM Cold ferment (fridge)',
      'Saturday, November 28',
      '7:45 AM Preheat oven and Dutch oven',
      '8:15 AM Bake, covered',
      '8:45 AM Bake, uncovered',
      '9:00 AM Cool',
      'final',
    ]);
    const feeding = model.rows[1];
    expect(feeding).toMatchObject({ meta: '8 h · range 6–10 h', tags: [{ kind: 'quietHours' }] });
    expect(model.rows[3]).toMatchObject({ meta: '4 folds, every 30 min · 2 h', foldCount: 4 });
    expect(model.rows[8]).toMatchObject({
      alongside: true,
      meta: 'Alongside Bake, covered · 30 min',
      slider: null,
    });
    expect(model.warningLines.map((l) => l.text)).toEqual([
      '1 step needs you during quiet hours (10 PM–6 AM).',
    ]);
  });

  it('shows fold sub-rows only when expanded', async () => {
    const item = previewItem(await recipeById(db, COUNTRY));
    const preview = buildPreview(previewInput([item]));
    const folds = preview.plan!.steps.find((s) => s.folds.length > 0)!;
    const model = buildTimeline(
      preview,
      [{ itemId: item.itemId, name: item.name, steps: item.steps, loaves: 1 }],
      ctx({ expandedFolds: new Set([folds.key]) }),
    );
    expect(
      model.rows.filter((r) => r.type === 'fold').map((r) => (r.type === 'fold' ? r.text : '')),
    ).toEqual(['Fold 1 · 12:05 PM', 'Fold 2 · 12:35 PM', 'Fold 3 · 1:05 PM', 'Fold 4 · 1:35 PM']);
  });
});
