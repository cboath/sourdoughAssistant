import type { Settings } from '../types';
import { asBool, type FieldMap } from '../sql';

export interface SettingsRow {
  id: 'settings';
  unit_system: Settings['unitSystem'];
  temperature_unit: Settings['temperatureUnit'];
  quiet_hours_enabled: number;
  quiet_start_min: number;
  quiet_end_min: number;
  oven_capacity: number;
  reheat_gap_min: number;
  markup_bps: number;
  sell_rounding_cents: number;
  heads_up_min: number;
  keep_awake_default: number;
  currency_override: string | null;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export const SETTINGS_FIELDS: FieldMap = {
  unitSystem: 'unit_system',
  temperatureUnit: 'temperature_unit',
  quietHoursEnabled: 'quiet_hours_enabled',
  quietStartMin: 'quiet_start_min',
  quietEndMin: 'quiet_end_min',
  ovenCapacity: 'oven_capacity',
  reheatGapMin: 'reheat_gap_min',
  markupBps: 'markup_bps',
  sellRoundingCents: 'sell_rounding_cents',
  headsUpMin: 'heads_up_min',
  keepAwakeDefault: 'keep_awake_default',
  currencyOverride: 'currency_override',
  onboardingCompletedAt: 'onboarding_completed_at',
};

export function toSettings(row: SettingsRow): Settings {
  return {
    id: row.id,
    unitSystem: row.unit_system,
    temperatureUnit: row.temperature_unit,
    quietHoursEnabled: asBool(row.quiet_hours_enabled),
    quietStartMin: row.quiet_start_min,
    quietEndMin: row.quiet_end_min,
    ovenCapacity: row.oven_capacity,
    reheatGapMin: row.reheat_gap_min,
    markupBps: row.markup_bps,
    sellRoundingCents: row.sell_rounding_cents,
    headsUpMin: row.heads_up_min,
    keepAwakeDefault: asBool(row.keep_awake_default),
    currencyOverride: row.currency_override,
    onboardingCompletedAt: row.onboarding_completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}
