import type { QuietHours } from '@sourdough/core';
import { useMemo } from 'react';
import { useSettings } from '../../../state/settings';

/** The stored default (data-model.md section 2, `heads_up_min DEFAULT 10`). */
export const DEFAULT_HEADS_UP_MIN = 10;

export interface ScheduleSettings {
  quiet: QuietHours;
  ovenCapacity: number;
  reheatGapMin: number;
  headsUpMin: number;
  markupBps: number;
  sellRoundingCents: number;
  temperatureUnit: 'C' | 'F';
}

/** Settings the planner reads, with the decided defaults when settings aren't loaded (tests). */
export function useScheduleSettings(): ScheduleSettings {
  const s = useSettings((state) => state.settings);
  return useMemo(
    () => ({
      quiet: {
        enabled: s?.quietHoursEnabled ?? true,
        startMin: s?.quietStartMin ?? 22 * 60,
        endMin: s?.quietEndMin ?? 6 * 60,
      },
      ovenCapacity: s?.ovenCapacity ?? 1,
      reheatGapMin: s?.reheatGapMin ?? 0,
      headsUpMin: s?.headsUpMin ?? DEFAULT_HEADS_UP_MIN,
      markupBps: s?.markupBps ?? 20000,
      sellRoundingCents: s?.sellRoundingCents ?? 0,
      temperatureUnit: s?.temperatureUnit ?? 'C',
    }),
    [s],
  );
}
