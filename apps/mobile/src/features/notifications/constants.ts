/**
 * Notification constants (ADR 0011). Pure, no React and no expo-notifications import, so the
 * planner and service run in the Jest `db` project.
 */
import { IOS_PENDING_CAP, IOS_PLANNER_BUDGET, SPIKE_PREFIX } from './spikeCore';

/** Every id the planner owns starts with this. Reconcile lists and cancels only these. */
export const NAMESPACE = 'sa1:';
/** The "Send a test reminder" id prefix (ADR 0011 section 2a). Outside our namespace on purpose. */
export const TEST_PREFIX = SPIKE_PREFIX;

export { IOS_PENDING_CAP };

/** ADR 0011 section 3: iOS keeps 60 of the 64 pending slots for the plan. */
export const IOS_BUDGET = IOS_PLANNER_BUDGET;
/** Android is far below AlarmManager's 500-alarm cap. */
export const ANDROID_BUDGET = 150;

/** Intents firing sooner than this are never scheduled (ADR 0011 section 3). */
export const MIN_LEAD_MS = 5_000;
/** Titles and bodies are capped at 100 characters (ADR 0011 section 4). */
export const MAX_TEXT_LENGTH = 100;
/** The test reminder fires this long after the tap (ADR 0011 section 2a). */
export const TEST_DELAY_MS = 10_000;
/** Cap on step ids listed in a coalesced payload. */
export const MAX_COALESCED_IDS = 8;

/** The id of the single top-up sentinel. `app` stands in for the bake id. */
export const SENTINEL_ID = `${NAMESPACE}app:sentinel:topup`;

/** Android channel ids are versioned: a channel's importance cannot change once it exists. */
export const CHANNEL = {
  steps: 'bake-steps-v1',
  headsUp: 'bake-headsup-v1',
  general: 'general-v1',
} as const;
export type ChannelId = (typeof CHANNEL)[keyof typeof CHANNEL];

/** `app_meta` keys (device-local, never backed up). */
export const META_KEYS = {
  alarmPrimerShownAt: 'alarmPrimerShownAt',
  lastTimeZone: 'lastTimeZone',
} as const;
