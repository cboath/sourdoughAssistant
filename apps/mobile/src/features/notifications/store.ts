/**
 * Reminder health (ADR 0011 section 7): what the OS lets us do, and how the last reconcile went.
 * Pure Zustand state, no expo imports. The service and `permissions.ts` write it; banners read it.
 */
import { create } from 'zustand';
import type { ExactAlarmStatus, PermissionStatus } from './types';

export interface PermissionsState {
  /** `unknown` until the first refresh. */
  notifications: PermissionStatus | 'unknown';
  exactAlarm: ExactAlarmStatus | 'unknown';
  /** ISO of the last time the alarm primer was shown, persisted in `app_meta`. */
  alarmPrimerShownAt: string | null;
  /** Reminders that could not be scheduled in the last reconcile. */
  failedCount: number;
  /** Consecutive failed "Try again" attempts, for `banner.notifFailed.again`. */
  failedAttempts: number;
  /** Some intents were left out of the budget. */
  budgetTrimmed: boolean;
  dismissed: { notifOff: boolean; alarmOff: boolean; budget: boolean };
  set(patch: Partial<Omit<PermissionsState, 'set' | 'dismiss' | 'reset'>>): void;
  dismiss(key: keyof PermissionsState['dismissed']): void;
  reset(): void;
}

const initial = {
  notifications: 'unknown',
  exactAlarm: 'unknown',
  alarmPrimerShownAt: null,
  failedCount: 0,
  failedAttempts: 0,
  budgetTrimmed: false,
  dismissed: { notifOff: false, alarmOff: false, budget: false },
} as const satisfies Partial<PermissionsState>;

export const usePermissions = create<PermissionsState>()((set) => ({
  ...initial,
  dismissed: { ...initial.dismissed },
  set: (patch) => set(patch),
  dismiss: (key) => set((s) => ({ dismissed: { ...s.dismissed, [key]: true } })),
  reset: () => set({ ...initial, dismissed: { ...initial.dismissed } }),
}));

export type ReminderBanner = 'notifOff' | 'notifFailed' | 'alarmOff' | 'budget';

/**
 * Which banners to show (screens-bake.md 0.4 and 7): precedence is notifications off, reminders
 * failed, exact alarms off, budget; at most two at once; "notifications off" hides "alarms off".
 */
export function visibleBanners(
  s: Pick<
    PermissionsState,
    'notifications' | 'exactAlarm' | 'failedCount' | 'budgetTrimmed' | 'dismissed'
  >,
): ReminderBanner[] {
  const out: ReminderBanner[] = [];
  const off = s.notifications === 'denied' || s.notifications === 'undetermined';
  if (off && !s.dismissed.notifOff) out.push('notifOff');
  if (!off && s.failedCount > 0) out.push('notifFailed');
  if (!off && s.exactAlarm === 'denied' && !s.dismissed.alarmOff) out.push('alarmOff');
  if (s.budgetTrimmed && !s.dismissed.budget) out.push('budget');
  return out.slice(0, 2);
}
