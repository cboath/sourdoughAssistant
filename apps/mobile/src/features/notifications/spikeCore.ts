/**
 * IO-01 spike: pure helpers, no React and no expo-notifications import (runs in the Jest `db`
 * project). The spike harness is development-only; see `spike/` and `app/dev-notifications.tsx`.
 */

/** Spike reminders live outside the `sa1:` namespace (ADR 0011 section 2a), so reconcile ignores them. */
export const SPIKE_PREFIX = 'satest:';
/** iOS keeps at most 64 pending local notifications and drops the rest (ADR 0011). */
export const IOS_PENDING_CAP = 64;
/** ADR 0011 section 3: the planner budget, leaving slack under the cap. */
export const IOS_PLANNER_BUDGET = 60;

export type SpikePermission = 'undetermined' | 'denied' | 'provisional' | 'authorized' | 'unknown';
export type SpikeLevel = 'passive' | 'active' | 'timeSensitive';

/** Numeric values of expo-notifications' `IosAuthorizationStatus`. */
const IOS_STATUS: Record<number, SpikePermission> = {
  0: 'undetermined',
  1: 'denied',
  2: 'authorized',
  3: 'provisional',
  4: 'authorized', // ephemeral (App Clips), not used by this app
};

export function classifyPermission(settings: {
  granted?: boolean;
  canAskAgain?: boolean;
  ios?: { status: number };
}): SpikePermission {
  if (settings.ios) return IOS_STATUS[settings.ios.status] ?? 'unknown';
  if (settings.granted) return 'authorized';
  return settings.canAskAgain === false ? 'denied' : 'undetermined';
}

export function isSpikeId(identifier: string): boolean {
  return identifier.startsWith(SPIKE_PREFIX);
}

export function spikeId(batch: number, index: number): string {
  return `${SPIKE_PREFIX}${batch}:${index}`;
}

export interface SpikeBatchOptions {
  count: number;
  /** Seconds from `nowMs` to the first reminder. */
  firstDelaySec: number;
  /** Seconds between reminders. */
  spacingSec: number;
  nowMs: number;
}

export interface SpikeItem {
  identifier: string;
  fireAtMs: number;
  /** 1-based position, for the static title. */
  position: number;
}

export const MAX_SPIKE_BATCH = 100;

/** Clamps to a sane size and returns deterministic ids plus fire times. */
export function planSpikeBatch(opts: SpikeBatchOptions): SpikeItem[] {
  const count = Math.max(0, Math.min(MAX_SPIKE_BATCH, Math.floor(opts.count)));
  const first = Math.max(2, Math.floor(opts.firstDelaySec));
  const spacing = Math.max(1, Math.floor(opts.spacingSec));
  return Array.from({ length: count }, (_, i) => ({
    identifier: spikeId(opts.nowMs, i + 1),
    fireAtMs: opts.nowMs + (first + i * spacing) * 1000,
    position: i + 1,
  }));
}

export interface PendingSummary {
  total: number;
  spike: number;
  other: number;
}

export function summarizePending(identifiers: readonly string[]): PendingSummary {
  const spike = identifiers.filter(isSpikeId).length;
  return { total: identifiers.length, spike, other: identifiers.length - spike };
}

export function describeCap(total: number): string {
  if (total <= IOS_PLANNER_BUDGET) return 'within the planner budget (60)';
  if (total <= IOS_PENDING_CAP) return 'above the planner budget, under the iOS cap (64)';
  return 'above the iOS cap (64): iOS should keep only 64';
}
