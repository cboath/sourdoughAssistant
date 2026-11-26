/** Production wiring for `bootstrapApp`. Imports expo-sqlite, so tests never import this file. */
import { getRepositories } from '../db/client';
import { seedDatabase } from '../db/seed';
import { getDeviceLocaleDefaults } from '../lib/deviceLocale';
import { useSettings } from '../state/settings';
import type { BootstrapDeps } from './bootstrap';

export const defaultBootstrapDeps: BootstrapDeps = {
  getRepositories,
  seed: (repos) => seedDatabase(repos),
  hydrateSettings: (repo, defaults) => useSettings.getState().hydrate(repo, defaults),
  localeDefaults: getDeviceLocaleDefaults,
};
