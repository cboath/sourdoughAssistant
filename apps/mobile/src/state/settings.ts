/**
 * Settings store (architecture section 5, ADR 0002). The `settings` table is the source of truth:
 * `hydrate` loads it (creating the row from locale defaults on first launch) and `update` writes
 * through the repository before the store reflects the saved row.
 */
import { create } from 'zustand';
import type { SettingsRepository } from '../db/repositories';
import type { Settings, SettingsPatch } from '../db/types';
import type { LocaleSettingsDefaults } from '../lib/locale';

/** Provisional until Chris answers Q8 and the quiet-hours question; see data-model section 2. */
export const PROVISIONAL_SETTINGS_DEFAULTS = {
  quietHoursEnabled: true,
  quietStartMin: 22 * 60,
  quietEndMin: 6 * 60,
  ovenCapacity: 1,
  reheatGapMin: 0,
  markupBps: 20000,
} as const satisfies SettingsPatch;

export type SettingsStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface SettingsState {
  status: SettingsStatus;
  settings: Settings | null;
  error: Error | null;
  /** Loads the row, creating it from `localeDefaults` plus the provisional defaults when missing. */
  hydrate(repo: SettingsRepository, localeDefaults: LocaleSettingsDefaults): Promise<void>;
  /** Persists first, then publishes the saved row. Rejects (store unchanged) when the write fails. */
  update(patch: SettingsPatch): Promise<Settings>;
  /** Re-reads the row, for example after a backup restore. */
  reload(): Promise<void>;
  /** Clears the store (tests, restore). */
  reset(): void;
}

let repository: SettingsRepository | null = null;
let defaults: LocaleSettingsDefaults | null = null;
// Writes run one at a time so rapid edits land in order.
let queue: Promise<unknown> = Promise.resolve();

const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

export const useSettings = create<SettingsState>()((set) => {
  const load = async (repo: SettingsRepository, localeDefaults: LocaleSettingsDefaults) => {
    const settings = await repo.ensure({ ...PROVISIONAL_SETTINGS_DEFAULTS, ...localeDefaults });
    set({ status: 'ready', settings, error: null });
  };

  return {
    status: 'idle',
    settings: null,
    error: null,

    async hydrate(repo, localeDefaults) {
      repository = repo;
      defaults = localeDefaults;
      set({ status: 'loading', error: null });
      try {
        await load(repo, localeDefaults);
      } catch (e) {
        set({ status: 'error', error: toError(e) });
        throw e;
      }
    },

    update(patch) {
      const repo = repository;
      if (!repo) return Promise.reject(new Error('Settings are not loaded yet.'));
      const run = queue.then(async () => {
        const settings = await repo.update(patch);
        set({ settings, error: null });
        return settings;
      });
      queue = run.catch(() => undefined);
      return run;
    },

    async reload() {
      if (!repository || !defaults) throw new Error('Settings are not loaded yet.');
      await load(repository, defaults);
    },

    reset() {
      repository = null;
      defaults = null;
      queue = Promise.resolve();
      set({ status: 'idle', settings: null, error: null });
    },
  };
});

/** Selector for code that runs only after hydration (the app gates rendering on `status`). */
export function selectSettings(state: SettingsState): Settings {
  if (!state.settings) throw new Error('Settings are not loaded yet.');
  return state.settings;
}
