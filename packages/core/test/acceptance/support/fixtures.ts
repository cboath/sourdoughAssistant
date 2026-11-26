/**
 * Shared fixtures for the QA-02 acceptance suite.
 *
 * Rules: no Date.now(), no `new Date()` without arguments, no machine TZ. Every instant is an explicit ISO string and
 * every zone is an explicit IANA name. Expected schedule values were computed independently with Python zoneinfo
 * (see docs/test-cases/core-cases.md), not with the code under test.
 *
 * Types are structural and local on purpose: core-api.md does not say which file declares the schedule types, and these
 * tests must not depend on src/index.ts.
 */

export const NY = 'America/New_York';
export const LONDON = 'Europe/London';
export const KOLKATA = 'Asia/Kolkata';
export const LORD_HOWE = 'Australia/Lord_Howe';

/** Fixed clock for tests that need a "now" (ISO UTC). */
export const NOW_ISO = '2026-05-01T16:00:00.000Z'; // Fri 2026-05-01 12:00 EDT

export const ms = (iso: string): number => {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new Error(`bad ISO in test: ${iso}`);
  return t;
};
export const iso = (epochMs: number): string => new Date(epochMs).toISOString();
export const MIN = 60_000;

// ---------------------------------------------------------------------------------------------------------------------
// Recipes (R-HYD and R-COST from core-cases.md section 0)
// ---------------------------------------------------------------------------------------------------------------------

export type Line = {
  id: string;
  name: string;
  role: 'flour' | 'water' | 'salt' | 'levain' | 'inclusion' | 'other';
  amountG: number;
  levainHydrationPct?: number | null;
};

export const flour = (id: string, amountG: number, name = id): Line => ({
  id,
  name,
  role: 'flour',
  amountG,
});
export const water = (id: string, amountG: number, name = id): Line => ({
  id,
  name,
  role: 'water',
  amountG,
});
export const salt = (id: string, amountG: number, name = id): Line => ({
  id,
  name,
  role: 'salt',
  amountG,
});
export const levain = (id: string, amountG: number, hydrationPct = 100, name = id): Line => ({
  id,
  name,
  role: 'levain',
  amountG,
  levainHydrationPct: hydrationPct,
});
export const other = (
  id: string,
  amountG: number,
  role: Line['role'] = 'other',
  name = id,
): Line => ({
  id,
  name,
  role,
  amountG,
});

/** R-HYD: flour 500, water 375, salt 10, levain 100 at 100% (PRD section 4). */
export const rHyd = (levainHydrationPct = 100): Line[] => [
  flour('flour', 500),
  water('water', 375),
  salt('salt', 10),
  levain('levain', 100, levainHydrationPct),
];

// ---------------------------------------------------------------------------------------------------------------------
// Pantry packages (chosen so unit costs equal the PRD's per-gram prices exactly)
// ---------------------------------------------------------------------------------------------------------------------

export const P_BREAD = { priceCents: 1200, size: 5000, unit: 'g' as const }; // 0.24 c/g
export const P_WW = { priceCents: 350, size: 1000, unit: 'g' as const }; // 0.35 c/g
export const P_SALT = { priceCents: 100, size: 1000, unit: 'g' as const }; // 0.10 c/g
export const P_WATER = { priceCents: 0, size: 1000, unit: 'g' as const }; // free (C-5)
export const P_BREAD_5LB = { priceCents: 544, size: 5, unit: 'lb' as const }; // 0.239859 c/g

// ---------------------------------------------------------------------------------------------------------------------
// Default sourdough template (PRD section 5)
// ---------------------------------------------------------------------------------------------------------------------

export type Step = {
  id: string;
  name: string;
  kind: string;
  durationMin: number;
  minMin: number;
  maxMin: number;
  tempSensitive: boolean;
  anchor:
    | { type: 'sequential' }
    | {
        type: 'alongside';
        stepId: string;
        align: 'endsAtStart' | 'startsAtStart' | 'endsAtEnd';
        offsetMin?: number;
      };
  folds: { count: number; intervalMin: number } | null;
  notify: boolean;
};

const seq = { type: 'sequential' } as const;
const mk = (
  id: string,
  kind: string,
  durationMin: number,
  minMin: number,
  maxMin: number,
  extra: Partial<Step> = {},
): Step => ({
  id,
  name: id,
  kind,
  durationMin,
  minMin,
  maxMin,
  tempSensitive: false,
  anchor: seq,
  folds: null,
  notify: true,
  ...extra,
});

/** Step ids used everywhere in the acceptance tests. Recipe order = array order. */
export const defaultTemplate = (): Step[] => [
  mk('feed', 'feed', 480, 360, 600),
  mk('mix', 'mix', 60, 30, 120),
  mk('folds', 'fold', 120, 120, 120, { folds: { count: 4, intervalMin: 30 } }),
  mk('bulk', 'bulk', 360, 300, 480, { tempSensitive: true }),
  mk('shape', 'shape', 10, 5, 15),
  mk('cold', 'coldProof', 720, 720, 1440),
  mk('preheat', 'preheat', 30, 20, 45, {
    anchor: { type: 'alongside', stepId: 'bake1', align: 'endsAtStart' },
  }),
  mk('bake1', 'bake', 30, 25, 35),
  mk('bake2', 'bake', 15, 10, 25),
  mk('cool', 'cool', 60, 30, 120),
];

/** Sequential chain at defaults, in order, with minutes. Preheat is alongside and adds nothing. */
export const CHAIN = [
  ['feed', 480],
  ['mix', 60],
  ['folds', 120],
  ['bulk', 360],
  ['shape', 10],
  ['cold', 720],
  ['bake1', 30],
  ['bake2', 15],
  ['cool', 60],
] as const;
export const TOTAL_MIN = 1855;

export const ITEM = 'loaf';

export const item = (over: Record<string, unknown> = {}) => ({
  itemId: ITEM,
  label: 'Country loaf',
  steps: defaultTemplate(),
  loaves: 1,
  ...over,
});

export const input = (
  over: Record<string, unknown> = {},
  itemOver: Record<string, unknown> = {},
) => ({
  items: [item(itemOver)],
  ovenCapacity: 1,
  ...over,
});

// ---------------------------------------------------------------------------------------------------------------------
// Plan helpers (tolerant of the step-key convention, which core-api.md leaves open for single-slot bakes)
// ---------------------------------------------------------------------------------------------------------------------

export type PStep = {
  key: string;
  itemId: string | null;
  stepId: string | null;
  slotIndex: number | null;
  kind: string;
  startAt: number;
  endAt: number;
  durationMin: number;
  minMin: number;
  maxMin: number;
  durationSource: string;
  folds: { index: number; at: number }[];
  loaves: number | null;
  isAlongside: boolean;
};

/** Find the planned step for (itemId, stepId). With several per-slot copies, pass `slot` (the slotIndex value). */
export function stepOf(
  plan: { steps: PStep[] },
  itemId: string,
  stepId: string,
  slot?: number,
): PStep {
  // The merged preheat is bake-wide (itemId and stepId null, key 'bake:preheat', ADR 0009 rule 7).
  if (stepId === 'preheat') {
    const pre = plan.steps.filter((s) => s.kind === 'preheat');
    if (pre.length !== 1) throw new Error(`expected exactly one preheat step, got ${pre.length}`);
    return pre[0]!;
  }
  const hits = plan.steps.filter(
    (s) =>
      s.itemId === itemId && s.stepId === stepId && (slot === undefined || s.slotIndex === slot),
  );
  if (hits.length !== 1) {
    throw new Error(
      `expected exactly one planned step for ${itemId}/${stepId} (slot ${slot}), got ${hits.length}`,
    );
  }
  return hits[0]!;
}

export const preheatSteps = (plan: { steps: PStep[] }): PStep[] =>
  plan.steps.filter((s) => s.kind === 'preheat');

/** [stepId, startIso] pairs for one item, sequential and alongside, sorted by start then template order. */
export function startsByStep(plan: { steps: PStep[] }, itemId = ITEM): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of plan.steps) {
    if (s.itemId === itemId && s.stepId) out[s.stepId] = iso(s.startAt);
    else if (s.kind === 'preheat' && s.key === 'bake:preheat') out.preheat = iso(s.startAt);
  }
  return out;
}

/** Fresh StepProgress[] (all pending) for every step in a plan. */
export function pendingProgress(plan: { steps: PStep[] }) {
  return plan.steps.map((s) => ({
    key: s.key,
    status: 'pending' as const,
    actualStartAt: null,
    actualEndAt: null,
    inferredDone: false,
    foldTimes: [] as number[],
  }));
}

/** Recursively freeze, to prove core never mutates its inputs. */
export function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
  }
  return o;
}

// ---------------------------------------------------------------------------------------------------------------------
// Expected schedules (UTC ISO, step id -> start). Independent Python zoneinfo values.
// ---------------------------------------------------------------------------------------------------------------------

export type Expected = {
  zone: string;
  readyLocal: { date: string; time: string };
  readyUtc: string;
  starts: Record<string, string>;
  /** local wall-clock strings 'ddd HH:mm' for the first and last rows, for the "local reading" assertions */
  local: Record<string, string>;
};

/** SCH-01 and core-api section 7: Sat 2026-11-28 10:00 EST. */
export const NOV28: Expected = {
  zone: NY,
  readyLocal: { date: '2026-11-28', time: '10:00' },
  readyUtc: '2026-11-28T15:00:00.000Z',
  starts: {
    feed: '2026-11-27T08:05:00.000Z',
    mix: '2026-11-27T16:05:00.000Z',
    folds: '2026-11-27T17:05:00.000Z',
    bulk: '2026-11-27T19:05:00.000Z',
    shape: '2026-11-28T01:05:00.000Z',
    cold: '2026-11-28T01:15:00.000Z',
    preheat: '2026-11-28T12:45:00.000Z',
    bake1: '2026-11-28T13:15:00.000Z',
    bake2: '2026-11-28T13:45:00.000Z',
    cool: '2026-11-28T14:00:00.000Z',
  },
  local: { feed: 'Fri 03:05', preheat: 'Sat 07:45', bake1: 'Sat 08:15', cool: 'Sat 09:00' },
};

/** Same date with an 18 h cold ferment (overrides.cold = 1080). core-api section 7: feed Thu 21:05. */
export const NOV28_COLD18: Expected = {
  ...NOV28,
  starts: {
    feed: '2026-11-27T02:05:00.000Z',
    mix: '2026-11-27T10:05:00.000Z',
    folds: '2026-11-27T11:05:00.000Z',
    bulk: '2026-11-27T13:05:00.000Z',
    shape: '2026-11-27T19:05:00.000Z',
    cold: '2026-11-27T19:15:00.000Z',
    preheat: '2026-11-28T12:45:00.000Z',
    bake1: '2026-11-28T13:15:00.000Z',
    bake2: '2026-11-28T13:45:00.000Z',
    cool: '2026-11-28T14:00:00.000Z',
  },
  local: { feed: 'Thu 21:05', mix: 'Fri 05:05', folds: 'Fri 06:05' },
};

/** SCH-01 as written in the PRD: Sat 2026-05-02 10:00 EDT. */
export const MAY2: Expected = {
  zone: NY,
  readyLocal: { date: '2026-05-02', time: '10:00' },
  readyUtc: '2026-05-02T14:00:00.000Z',
  starts: {
    feed: '2026-05-01T07:05:00.000Z',
    mix: '2026-05-01T15:05:00.000Z',
    folds: '2026-05-01T16:05:00.000Z',
    bulk: '2026-05-01T18:05:00.000Z',
    shape: '2026-05-02T00:05:00.000Z',
    cold: '2026-05-02T00:15:00.000Z',
    preheat: '2026-05-02T11:45:00.000Z',
    bake1: '2026-05-02T12:15:00.000Z',
    bake2: '2026-05-02T12:45:00.000Z',
    cool: '2026-05-02T13:00:00.000Z',
  },
  local: { feed: 'Fri 03:05', preheat: 'Sat 07:45' },
};

/** SCH-19: same wall-clock reading in Asia/Kolkata (UTC+5:30, no DST). */
export const KOLKATA_MAY2: Expected = {
  zone: KOLKATA,
  readyLocal: { date: '2026-05-02', time: '10:00' },
  readyUtc: '2026-05-02T04:30:00.000Z',
  starts: {
    feed: '2026-04-30T21:35:00.000Z',
    mix: '2026-05-01T05:35:00.000Z',
    folds: '2026-05-01T06:35:00.000Z',
    bulk: '2026-05-01T08:35:00.000Z',
    shape: '2026-05-01T14:35:00.000Z',
    cold: '2026-05-01T14:45:00.000Z',
    preheat: '2026-05-02T02:15:00.000Z',
    bake1: '2026-05-02T02:45:00.000Z',
    bake2: '2026-05-02T03:15:00.000Z',
    cool: '2026-05-02T03:30:00.000Z',
  },
  local: { feed: 'Fri 03:05', preheat: 'Sat 07:45' },
};

/** DST-01: spring forward, ready Sun 2026-03-08 10:00 EDT. Feeding reads Sat 02:05 EST. */
export const SPRING: Expected = {
  zone: NY,
  readyLocal: { date: '2026-03-08', time: '10:00' },
  readyUtc: '2026-03-08T14:00:00.000Z',
  starts: {
    feed: '2026-03-07T07:05:00.000Z',
    mix: '2026-03-07T15:05:00.000Z',
    folds: '2026-03-07T16:05:00.000Z',
    bulk: '2026-03-07T18:05:00.000Z',
    shape: '2026-03-08T00:05:00.000Z',
    cold: '2026-03-08T00:15:00.000Z',
    preheat: '2026-03-08T11:45:00.000Z',
    bake1: '2026-03-08T12:15:00.000Z',
    bake2: '2026-03-08T12:45:00.000Z',
    cool: '2026-03-08T13:00:00.000Z',
  },
  local: { feed: 'Sat 02:05', cold: 'Sat 19:15', bake1: 'Sun 08:15' },
};

/** DST-02: fall back, ready Sun 2026-11-01 10:00 EST. Feeding reads Sat 04:05 EDT. */
export const FALL: Expected = {
  zone: NY,
  readyLocal: { date: '2026-11-01', time: '10:00' },
  readyUtc: '2026-11-01T15:00:00.000Z',
  starts: {
    feed: '2026-10-31T08:05:00.000Z',
    mix: '2026-10-31T16:05:00.000Z',
    folds: '2026-10-31T17:05:00.000Z',
    bulk: '2026-10-31T19:05:00.000Z',
    shape: '2026-11-01T01:05:00.000Z',
    cold: '2026-11-01T01:15:00.000Z',
    preheat: '2026-11-01T12:45:00.000Z',
    bake1: '2026-11-01T13:15:00.000Z',
    bake2: '2026-11-01T13:45:00.000Z',
    cool: '2026-11-01T14:00:00.000Z',
  },
  local: { feed: 'Sat 04:05', cold: 'Sat 21:15', bake1: 'Sun 08:15' },
};

/** DST-03: UK spring forward, ready Sun 2026-03-29 10:00 BST. */
export const UK_SPRING: Expected = {
  zone: LONDON,
  readyLocal: { date: '2026-03-29', time: '10:00' },
  readyUtc: '2026-03-29T09:00:00.000Z',
  starts: {
    feed: '2026-03-28T02:05:00.000Z',
    mix: '2026-03-28T10:05:00.000Z',
    folds: '2026-03-28T11:05:00.000Z',
    bulk: '2026-03-28T13:05:00.000Z',
    shape: '2026-03-28T19:05:00.000Z',
    cold: '2026-03-28T19:15:00.000Z',
    preheat: '2026-03-29T06:45:00.000Z',
    bake1: '2026-03-29T07:15:00.000Z',
    bake2: '2026-03-29T07:45:00.000Z',
    cool: '2026-03-29T08:00:00.000Z',
  },
  local: { feed: 'Sat 02:05', cold: 'Sat 19:15', bake1: 'Sun 08:15' },
};
