import type { BakeAggregate } from '../../db/types';
import type { ChannelId } from './constants';

export type Platform = 'ios' | 'android';
export type IntentKind = 'start' | 'fold' | 'headsup' | 'topup' | 'ready' | 'test';
export type InterruptionLevel = 'timeSensitive' | 'active';
export type Delivery = 'alarmClock' | 'bestEffort';

/**
 * `content.data`, round-tripped through the OS and validated again on tap (`payload.ts`).
 * Never holds names, notes or money.
 */
export interface NotificationPayload {
  v: 1;
  kind: IntentKind;
  /** Absent for `topup` and `test`. */
  bakeId?: string;
  bakeStepId?: string;
  stepKey?: string;
  foldIndex?: number;
  /** Extra steps merged into this notification (same minute, same bake). */
  bakeStepIds?: string[];
  /** ISO UTC. */
  fireAt: string;
  hash: string;
}

export interface NotificationIntent {
  /** `sa1:<bakeId>:<stepKey>:<kind>[:<n>]`, or `satest:<epochMs>`. */
  id: string;
  kind: IntentKind;
  bakeId: string | null;
  fireAtMs: number;
  title: string;
  body: string;
  /** Android only. */
  channelId?: ChannelId;
  /** Android only. */
  delivery?: Delivery;
  /** iOS only. */
  interruptionLevel?: InterruptionLevel;
  /** iOS thread (groups one bake's notifications). */
  threadId?: string;
  data: NotificationPayload;
}

export interface PlannerInput {
  /** Only `scheduled` and `active` bakes produce intents. */
  bakes: readonly BakeAggregate[];
  nowMs: number;
  /** The device's current zone, for the "ready {dayTime}" text. */
  zone: string;
  locale?: string;
  platform: Platform;
  /** Android: `SCHEDULE_EXACT_ALARM` granted, so start and fold may use `alarmClock`. */
  exactAlarm: boolean;
  /** `flags.readyNotification` (B8). Off emits no `ready` intents. */
  readyEnabled: boolean;
  /** Defaults to the platform budget. */
  budget?: number;
}

export interface PlannerResult {
  /** The desired set, sorted by `fireAtMs`. Includes the sentinel when one is needed. */
  intents: NotificationIntent[];
  /** Intents the budget left out. */
  trimmed: { critical: number; other: number };
}

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';
export type ExactAlarmStatus = 'granted' | 'denied' | 'notApplicable';

export interface PendingRequest {
  identifier: string;
  /** `content.data.hash`, or null when missing or not ours. */
  hash: string | null;
}

/** The platform seam. The Expo implementation is `expoNotifier.ts`; tests use a fake. */
export interface NotifierPort {
  platform: Platform;
  getPermission(): Promise<PermissionStatus>;
  getExactAlarm(): Promise<ExactAlarmStatus>;
  listPending(): Promise<PendingRequest[]>;
  schedule(intent: NotificationIntent): Promise<void>;
  cancel(identifier: string): Promise<void>;
}

export type ReconcileMode = 'diff' | 'rebuild';

export interface ReconcileResult {
  status: 'ok' | 'denied' | 'undetermined' | 'error';
  scheduled: number;
  cancelled: number;
  kept: number;
  failed: number;
  trimmed: { critical: number; other: number };
}
