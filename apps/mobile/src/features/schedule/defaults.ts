/**
 * Smart default ready time (flows.md 5.1, open-questions D4): the time of day of the last bake's
 * requested ready time (else 10:00 AM), on the earliest date where the whole schedule still fits
 * after now. Computed once, when the draft is created.
 */
import {
  earliestReadyAt,
  fromIso,
  localToUtc,
  utcToLocal,
  type EpochMs,
  type IanaZone,
  type LocalDateTime,
} from '@sourdough/core';
import type { Bake } from '../../db/types';
import type { PreviewInput } from './preview';

export const DEFAULT_READY_TIME = '10:00';
/** The ready picker's window (screens-bake.md 3.4). */
export const MAX_READY_DAYS_AHEAD = 90;

/** `date` ("YYYY-MM-DD") plus `days`, calendar arithmetic with no zone involved. */
export function addDays(date: string, days: number): string {
  const [y = 1970, m = 1, d = 1] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** "HH:mm" of the most recently scheduled bake's requested ready time, in the current zone. */
export function lastBakeTimeOfDay(bakes: readonly Bake[], zone: IanaZone): string | null {
  let latest: Bake | null = null;
  for (const bake of bakes) {
    if (!bake.requestedReadyAt) continue;
    if (!latest || bake.createdAt > latest.createdAt) latest = bake;
  }
  return latest?.requestedReadyAt ? utcToLocal(fromIso(latest.requestedReadyAt), zone).time : null;
}

export function smartReadyLocal(args: {
  now: EpochMs;
  zone: IanaZone;
  timeOfDay: string;
  /** Earliest instant the bake can be ready; null when it can't be planned (then "after now"). */
  earliest: EpochMs | null;
}): LocalDateTime {
  const { now, zone, timeOfDay, earliest } = args;
  const floor = earliest ?? now;
  let date = utcToLocal(now, zone).date;
  for (let day = 0; day <= MAX_READY_DAYS_AHEAD + 1; day += 1) {
    const candidate = { date, time: timeOfDay };
    if (localToUtc(candidate, zone).at >= floor) return candidate;
    date = addDays(date, 1);
  }
  return { date, time: timeOfDay };
}

/** Builds the default for a draft that has recipes loaded but no ready time yet. */
export function defaultReadyLocal(
  input: Omit<PreviewInput, 'mode' | 'readyLocal'>,
  lastBakes: readonly Bake[],
): LocalDateTime {
  const timeOfDay = lastBakeTimeOfDay(lastBakes, input.zone) ?? DEFAULT_READY_TIME;
  const result = earliestReadyAt(
    {
      items: input.items.map((item) => ({
        itemId: item.itemId,
        label: item.name,
        steps: item.steps,
        loaves: item.loaves,
        durations: { kitchenTempC: input.kitchenTempC, overrides: item.overrides },
      })),
      ovenCapacity: input.ovenCapacity,
      reheatGapMin: input.reheatGapMin,
    },
    input.now,
  );
  return smartReadyLocal({
    now: input.now,
    zone: input.zone,
    timeOfDay,
    earliest: result.ok ? result.value : null,
  });
}
