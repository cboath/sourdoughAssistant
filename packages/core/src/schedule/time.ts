// Time and zones (docs/core-api.md 5.4, ADR 0005).
// Durations are elapsed minutes; the scheduler only adds and subtracts epoch ms.
// Zones matter only at the edges: local input -> instant, instant -> local display.

import type { Locale } from 'date-fns';
import { format } from 'date-fns-tz';
import { CoreInvariantError, type EpochMs, type IanaZone, type IsoUtc } from '../types';
import type { BakePlan, PlanWarning } from './backward';

export type LocalDateTime = { date: string /* YYYY-MM-DD */; time: string /* HH:mm */ };
export type LocalAdjustment = 'none' | 'shiftedForward' | 'ambiguousEarlier';

const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;

const dtfCache = new Map<string, Intl.DateTimeFormat>();

/** Wall-clock parts of instant `at` in `zone`, via Intl (throws CoreInvariantError on an unknown zone). */
function wallParts(at: EpochMs, zone: IanaZone) {
  let dtf = dtfCache.get(zone);
  if (!dtf) {
    try {
      dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      throw new CoreInvariantError(`Unknown or invalid time zone: ${zone}`);
    }
    dtfCache.set(zone, dtf);
  }
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(at))) p[part.type] = part.value;
  return {
    year: p.year!,
    month: p.month!,
    day: p.day!,
    hour: p.hour === '24' ? '00' : p.hour!,
    minute: p.minute!,
    second: p.second!,
  };
}

/**
 * UTC offset of `zone` at instant `at`, in ms. Uses Intl directly: date-fns-tz
 * getTimezoneOffset misreads instants near a transition, and its formatInTimeZone is wrong
 * for Lord Howe's 30 minute DST shift.
 */
function offsetMs(at: EpochMs, zone: IanaZone): number {
  const w = wallParts(at, zone);
  const wallMs = Date.UTC(+w.year, +w.month - 1, +w.day, +w.hour, +w.minute, +w.second);
  const utcSec = Math.floor(at / 1000) * 1000;
  return Math.round((wallMs - utcSec) / MIN_MS) * MIN_MS;
}

function parseLocal(local: LocalDateTime): number {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(local.date);
  const t = /^(\d{2}):(\d{2})$/.exec(local.time);
  if (!d || !t)
    throw new CoreInvariantError(`Invalid local date/time: ${local.date} ${local.time}`);
  const [y, mo, da] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const [h, mi] = [Number(t[1]), Number(t[2])];
  const naive = Date.UTC(y, mo - 1, da, h, mi);
  const check = new Date(naive);
  if (
    h > 23 ||
    mi > 59 ||
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== mo - 1 ||
    check.getUTCDate() !== da
  ) {
    throw new CoreInvariantError(`Invalid local date/time: ${local.date} ${local.time}`);
  }
  return naive;
}

/**
 * Local wall-clock time to an instant. A nonexistent time (spring-forward gap) moves forward by
 * the gap length; a repeated time (fall-back) resolves to the first occurrence (AMB-04).
 */
export function localToUtc(
  local: LocalDateTime,
  zone: IanaZone,
): { at: EpochMs; adjustment: LocalAdjustment } {
  const naive = parseLocal(local); // the wall clock read as if it were UTC
  // Offsets a day either side of the wall time. A zone changes offset at most once in 48 h.
  const before = offsetMs(naive - 24 * HOUR_MS, zone);
  const after = offsetMs(naive + 24 * HOUR_MS, zone);
  if (before === after) return { at: naive - before, adjustment: 'none' };

  const c1 = naive - before;
  const c2 = naive - after;
  const ok1 = offsetMs(c1, zone) === before;
  const ok2 = offsetMs(c2, zone) === after;
  if (ok1 && ok2) return { at: Math.min(c1, c2), adjustment: 'ambiguousEarlier' };
  if (ok1) return { at: c1, adjustment: 'none' };
  if (ok2) return { at: c2, adjustment: 'none' };
  // Gap: neither reading is self-consistent. Apply the pre-transition offset, which lands
  // after the gap by exactly the gap length (02:30 EST -> 03:30 EDT).
  return { at: c1, adjustment: 'shiftedForward' };
}

export function utcToLocal(at: EpochMs, zone: IanaZone): LocalDateTime & { offsetMin: number } {
  const w = wallParts(at, zone);
  return {
    date: `${w.year}-${w.month}-${w.day}`,
    time: `${w.hour}:${w.minute}`,
    offsetMin: Math.round(offsetMs(at, zone) / MIN_MS),
  };
}

/**
 * Pattern formatting. The wall-clock fields come from Intl (see offsetMs for why not date-fns-tz
 * conversion), then date-fns-tz `format` renders the pattern (zone tokens use `zone`).
 */
export function formatInZone(
  at: EpochMs,
  zone: IanaZone,
  pattern: string,
  locale?: unknown /* date-fns Locale */,
): string {
  const w = wallParts(at, zone);
  const msPart = ((at % 1000) + 1000) % 1000;
  const wall = new Date(+w.year, +w.month - 1, +w.day, +w.hour, +w.minute, +w.second, msPart);
  // Years 0-99 are remapped by the Date constructor.
  if (+w.year < 100) wall.setFullYear(+w.year);
  return format(wall, pattern, {
    timeZone: zone,
    originalDate: new Date(at),
    ...(locale ? { locale: locale as Locale } : {}),
  });
}

/** Offset changes strictly between `from` and `to`, in time order. */
export function zoneTransitionsBetween(
  from: EpochMs,
  to: EpochMs,
  zone: IanaZone,
): { at: EpochMs; offsetChangeMin: number }[] {
  const out: { at: EpochMs; offsetChangeMin: number }[] = [];
  if (!(to > from)) return out;
  let a = from;
  let offA = offsetMs(a, zone);
  while (a < to) {
    const b = Math.min(a + HOUR_MS, to);
    const offB = offsetMs(b, zone);
    if (offB !== offA) {
      // Binary search the first instant in (a, b] that has the new offset.
      let lo = a;
      let hi = b;
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (offsetMs(mid, zone) === offA) lo = mid;
        else hi = mid;
      }
      if (hi > from && hi < to) {
        out.push({ at: hi, offsetChangeMin: Math.round((offB - offA) / MIN_MS) });
      }
    }
    a = b;
    offA = offB;
  }
  return out;
}

/** One warning per clock change that falls strictly inside a step's [startAt, endAt]. */
export function dstWarnings(plan: BakePlan, zone: IanaZone): PlanWarning[] {
  const out: PlanWarning[] = [];
  for (const s of plan.steps) {
    for (const t of zoneTransitionsBetween(s.startAt, s.endAt, zone)) {
      out.push({ code: 'dstTransition', stepKey: s.key, offsetChangeMin: t.offsetChangeMin });
    }
  }
  return out;
}

export function toIso(at: EpochMs): IsoUtc {
  if (!Number.isFinite(at)) throw new CoreInvariantError(`toIso: invalid instant ${at}`);
  return new Date(at).toISOString();
}

export function fromIso(iso: IsoUtc): EpochMs {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new CoreInvariantError(`fromIso: invalid ISO string ${iso}`);
  return ms;
}
