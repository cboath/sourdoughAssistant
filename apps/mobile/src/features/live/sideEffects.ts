/**
 * The seam between a live change and everything that reacts to it. RN-07 registers the
 * notification reconcile here; RN-08 only calls it, after an event, Done, hold, +15 min, undo,
 * finish, cancel or a sweep that changed a bake. Fired once the rows are committed. A failing
 * side effect never fails the change (the bake is already written).
 */
import { logger } from '../../lib/logger';

export type BakeProgressReason = 'event' | 'revert' | 'finish' | 'cancel' | 'sweep';

export interface LiveSideEffects {
  /** Called after the bake's rows changed: reschedule or cancel its reminders. */
  onBakeProgressChanged(bakeId: string, reason: BakeProgressReason): void | Promise<void>;
}

const noop: LiveSideEffects = { onBakeProgressChanged: () => undefined };

let current: LiveSideEffects = noop;

/** RN-07 installs its implementation at startup. Passing `null` restores the no-op (tests). */
export function setLiveSideEffects(next: LiveSideEffects | null): void {
  current = next ?? noop;
}

export async function notifyBakeProgressChanged(
  bakeId: string,
  reason: BakeProgressReason,
): Promise<void> {
  try {
    await current.onBakeProgressChanged(bakeId, reason);
  } catch (error) {
    logger.error('live.side_effect_failed', error);
  }
}
