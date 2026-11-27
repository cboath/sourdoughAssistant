/**
 * The device's 12/24 hour setting as an `Intl` option, so the app's clock times match the system
 * pickers (screens-bake.md 0.2, DR2-15). The shell reads the setting from expo-localization and
 * hands it over with `setDeviceUses24Hour`; until then (and in tests) the locale decides. Kept free
 * of native imports so the notification planner can use it under plain Node.
 */
let uses24Hour: boolean | null = null;

export function setDeviceUses24Hour(value: boolean | null | undefined): void {
  uses24Hour = typeof value === 'boolean' ? value : null;
}

export function hourCycleOption(): { hourCycle?: 'h12' | 'h23' } {
  if (uses24Hour === true) return { hourCycle: 'h23' };
  if (uses24Hour === false) return { hourCycle: 'h12' };
  return {};
}
