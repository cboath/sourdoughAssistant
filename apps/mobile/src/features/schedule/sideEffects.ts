/**
 * The seam between saving a bake and everything that reacts to it. RN-07 registers the
 * notification service here (schedule, then top up); RN-06 only calls it. A failing side effect
 * never fails the save: the bake is already written (screens-bake.md 12.1 item 1).
 */
import { logger } from '../../lib/logger';

export interface ScheduleSideEffects {
  /** Called once, after the bake and all its rows are committed. */
  onBakeScheduled(bakeId: string): void | Promise<void>;
}

const noop: ScheduleSideEffects = { onBakeScheduled: () => undefined };

let current: ScheduleSideEffects = noop;

/** RN-07 installs its implementation at startup. Passing `null` restores the no-op (tests). */
export function setScheduleSideEffects(next: ScheduleSideEffects | null): void {
  current = next ?? noop;
}

export async function notifyBakeScheduled(bakeId: string): Promise<void> {
  try {
    await current.onBakeScheduled(bakeId);
  } catch (error) {
    logger.error('schedule.side_effect_failed', error);
  }
}
