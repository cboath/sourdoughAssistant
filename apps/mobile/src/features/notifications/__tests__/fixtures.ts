/** Test builders for bake aggregates and a fake `NotifierPort`. Not imported by app code. */
import type {
  Bake,
  BakeAggregate,
  BakeItem,
  BakeStep,
  BakeStatus,
  BakeStepStatus,
} from '../../../db/types';
import type {
  ExactAlarmStatus,
  NotificationIntent,
  NotifierPort,
  PendingRequest,
  PermissionStatus,
} from '../types';
import type { StepKind } from '@sourdough/core';

export const MIN = 60_000;
export const HOUR = 60 * MIN;
/** Sat 2026-11-28 00:00 UTC. */
export const T0 = Date.UTC(2026, 10, 28, 0, 0, 0);

const iso = (ms: number) => new Date(ms).toISOString();
let counter = 0;
/** Deterministic v4-shaped uuid. */
export function uuid(): string {
  counter += 1;
  const hex = counter.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

export interface StepSpec {
  key: string;
  name: string;
  kind?: StepKind;
  startMs: number;
  durationMin: number;
  status?: BakeStepStatus;
  notify?: boolean;
  itemIndex?: number | null;
  folds?: { count: number; intervalMin: number; done?: number; foldTimes?: number[] };
  slotIndex?: number | null;
}

export interface BakeSpec {
  id?: string;
  status?: BakeStatus;
  recipes?: string[];
  headsUpMin?: number;
  steps: StepSpec[];
  readyMs?: number;
}

const base = { createdAt: iso(T0), updatedAt: iso(T0), deletedAt: null } as const;

export function makeBake(spec: BakeSpec): BakeAggregate {
  const bakeId = spec.id ?? uuid();
  const recipes = spec.recipes ?? ['Country loaf'];
  const items: BakeItem[] = recipes.map((name, position) => ({
    ...base,
    id: uuid(),
    bakeId,
    recipeId: null,
    position,
    loaves: 1,
    scaleFactor: 1,
    recipeSnapshot: {
      snapshotVersion: 1,
      recipe: { id: uuid(), name, yieldLoaves: 1, doughWeightG: null, notes: 'SECRET NOTE' },
      ingredients: [],
      steps: [],
    },
    costSnapshot: null,
  }));
  const steps: BakeStep[] = spec.steps.map((s, position) => {
    const itemIndex = s.itemIndex === undefined ? 0 : s.itemIndex;
    const f = s.folds;
    return {
      ...base,
      id: uuid(),
      bakeId,
      bakeItemId: itemIndex === null ? null : (items[itemIndex]?.id ?? null),
      stepKey: s.key,
      sourceStepId: null,
      slotIndex: s.slotIndex ?? null,
      position,
      name: s.name,
      kind: s.kind ?? 'other',
      isAlongside: false,
      durationMin: s.durationMin,
      durationSource: 'default',
      minMin: s.durationMin,
      maxMin: s.durationMin,
      originalPlannedStartAt: iso(s.startMs),
      plannedStartAt: iso(s.startMs),
      plannedEndAt: iso(s.startMs + s.durationMin * MIN),
      actualStartAt: null,
      actualEndAt: null,
      status: s.status ?? 'pending',
      inferredDone: false,
      foldCount: f?.count ?? null,
      foldIntervalMin: f?.intervalMin ?? null,
      foldsDone: f?.done ?? 0,
      foldTimes: (f?.foldTimes ?? []).map(iso),
      notify: s.notify ?? true,
    };
  });
  const bake: Bake = {
    ...base,
    id: bakeId,
    status: spec.status ?? 'scheduled',
    mode: 'backward',
    requestedReadyAt: null,
    originalReadyAt: iso(spec.readyMs ?? T0 + 30 * HOUR),
    plannedReadyAt: iso(spec.readyMs ?? T0 + 30 * HOUR),
    timeZone: 'UTC',
    kitchenTempC: null,
    ovenCapacity: 1,
    reheatGapMin: 0,
    headsUpMin: spec.headsUpMin ?? 10,
    currencyCode: 'USD',
    ovenSlots: [],
    notes: 'PRIVATE BAKE NOTE',
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
  };
  return { bake, items, steps };
}

/** A realistic overnight bake: feed, mix, fold step, bulk, shape, cold proof, preheat, bake, cool. */
export function overnightBake(opts: { id?: string; startMs: number; recipes?: string[] }) {
  let t = opts.startMs;
  const at = (min: number) => {
    const start = t;
    t += min * MIN;
    return start;
  };
  return makeBake({
    id: opts.id,
    recipes: opts.recipes,
    readyMs: opts.startMs + 30 * HOUR,
    steps: [
      {
        key: 'i:feed',
        name: 'Final starter feeding',
        kind: 'feed',
        startMs: at(480),
        durationMin: 480,
      },
      { key: 'i:mix', name: 'Mix and rest', kind: 'mix', startMs: at(60), durationMin: 60 },
      {
        key: 'i:fold',
        name: 'Stretch and folds',
        kind: 'fold',
        startMs: at(120),
        durationMin: 120,
        folds: { count: 4, intervalMin: 30 },
      },
      { key: 'i:bulk', name: 'Bulk ferment', kind: 'bulk', startMs: at(180), durationMin: 180 },
      { key: 'i:shape', name: 'Shape', kind: 'shape', startMs: at(30), durationMin: 30 },
      { key: 'i:cold', name: 'Cold proof', kind: 'coldProof', startMs: at(720), durationMin: 720 },
      {
        key: 'bake:preheat',
        name: 'Preheat oven',
        kind: 'preheat',
        startMs: at(45),
        durationMin: 45,
        itemIndex: null,
      },
      { key: 'i:bake:s1', name: 'Bake, covered', kind: 'bake', startMs: at(30), durationMin: 30 },
      { key: 'i:cool:s1', name: 'Cool', kind: 'cool', startMs: at(60), durationMin: 60 },
    ],
  });
}

export interface FakeNotifier extends NotifierPort {
  /** id -> content hash (null for entries we did not create). */
  store: Map<string, string | null>;
  intents: Map<string, NotificationIntent>;
  permission: PermissionStatus;
  exact: ExactAlarmStatus;
  failFor: Set<string>;
  calls: { schedule: number; cancel: number; cancelAll: number };
  seed(id: string, hash?: string | null): void;
  ids(prefix?: string): string[];
}

export function createFakeNotifier(platform: 'ios' | 'android' = 'ios'): FakeNotifier {
  const fake: FakeNotifier = {
    platform,
    store: new Map(),
    intents: new Map(),
    permission: 'granted',
    exact: platform === 'android' ? 'granted' : 'notApplicable',
    failFor: new Set(),
    calls: { schedule: 0, cancel: 0, cancelAll: 0 },
    async getPermission() {
      return fake.permission;
    },
    async getExactAlarm() {
      return fake.exact;
    },
    async listPending(): Promise<PendingRequest[]> {
      return [...fake.store].map(([identifier, hash]) => ({ identifier, hash }));
    },
    async schedule(intent) {
      fake.calls.schedule += 1;
      if (fake.failFor.has(intent.id)) throw new Error('schedule failed');
      fake.store.set(intent.id, intent.data.hash);
      fake.intents.set(intent.id, intent);
    },
    async cancel(id) {
      fake.calls.cancel += 1;
      fake.store.delete(id);
      fake.intents.delete(id);
    },
    seed(id, hash = null) {
      fake.store.set(id, hash);
    },
    ids(prefix = '') {
      return [...fake.store.keys()].filter((id) => id.startsWith(prefix)).sort();
    },
  };
  return fake;
}
