// Quiet hours (docs/core-api.md 5.5, ADR 0010 section 5). Warnings only; steps never move.

import type { EpochMs, IanaZone } from '../types';
import type { BakePlan, PlanWarning } from './backward';
import { utcToLocal } from './time';

export interface QuietHours {
  enabled: boolean;
  startMin: number; // minutes after local midnight
  endMin: number;
}

/** [start, end) in `zone`; wraps when start > end; start === end is an empty window. */
export function isInQuietHours(at: EpochMs, quiet: QuietHours, zone: IanaZone): boolean {
  if (!quiet.enabled || quiet.startMin === quiet.endMin) return false;
  const { time } = utcToLocal(at, zone);
  const [h, m] = time.split(':').map(Number) as [number, number];
  const minuteOfDay = h * 60 + m;
  if (quiet.startMin < quiet.endMin) {
    return minuteOfDay >= quiet.startMin && minuteOfDay < quiet.endMin;
  }
  return minuteOfDay >= quiet.startMin || minuteOfDay < quiet.endMin;
}

/**
 * Step starts (including alongside steps) and fold reminders. Fold 1 is merged into the
 * step-start notification (ADR 0010 section 3), so only folds 2..n add their own warnings.
 * Heads-ups are not checked.
 */
export function quietHoursWarnings(
  plan: BakePlan,
  quiet: QuietHours,
  zone: IanaZone,
): PlanWarning[] {
  if (!quiet.enabled || quiet.startMin === quiet.endMin) return [];
  const out: PlanWarning[] = [];
  for (const s of plan.steps) {
    if (isInQuietHours(s.startAt, quiet, zone)) {
      out.push({ code: 'quietHours', stepKey: s.key, at: s.startAt });
    }
    for (const f of s.folds) {
      if (f.index < 2) continue;
      if (isInQuietHours(f.at, quiet, zone)) {
        out.push({ code: 'quietHours', stepKey: s.key, at: f.at, foldIndex: f.index });
      }
    }
  }
  return out;
}
