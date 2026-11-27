/**
 * "Finished earlier? Set the time" (B9, screens-bake.md 9.3): the baker picks a clock time and the
 * app works out which instant they mean. Overnight overtime can be many hours, so the time is
 * today's, or yesterday's when today's hasn't happened yet.
 */
import {
  fromIso,
  localToUtc,
  recomputePlan,
  utcToLocal,
  type EpochMs,
  type IanaZone,
} from '@sourdough/core';
import type { BakeAggregate, BakeStep } from '../../db/types';
import { addDays } from '../schedule/defaults';
import { toBakePlan } from './plan';

export interface ClockTime {
  hour: number;
  minute: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The most recent instant at or before `now` whose wall-clock time in `zone` is `time`. */
export function resolveFinishedAt(time: ClockTime, now: EpochMs, zone: IanaZone): EpochMs {
  const today = utcToLocal(now, zone).date;
  const clock = `${pad(time.hour)}:${pad(time.minute)}`;
  const candidate = localToUtc({ date: today, time: clock }, zone).at;
  return candidate <= now
    ? candidate
    : localToUtc({ date: addDays(today, -1), time: clock }, zone).at;
}

export function clockTimeOf(at: EpochMs, zone: IanaZone): ClockTime {
  const [h = 0, m = 0] = utcToLocal(at, zone).time.split(':').map(Number);
  return { hour: h, minute: m };
}

/** The earliest time the step can have finished: when it started (or was due to, if it had). */
export function finishLowerBound(row: BakeStep, now: EpochMs): EpochMs | null {
  if (row.actualStartAt) return fromIso(row.actualStartAt);
  const planned = fromIso(row.plannedStartAt);
  return planned <= now ? planned : null;
}

/** What the bake's ready time would become if the step ended at `at`. Null when core rejects it. */
export function previewReadyAt(
  aggregate: BakeAggregate,
  row: BakeStep,
  at: EpochMs,
  now: EpochMs,
): { current: EpochMs; next: EpochMs } | null {
  const { plan, progress } = toBakePlan(aggregate);
  const result = recomputePlan(plan, progress, { type: 'stepDone', key: row.stepKey, at }, { now });
  return result.ok ? { current: plan.readyAt, next: result.value.plan.readyAt } : null;
}
