/**
 * Startup sequence, steps 2 and 3 (architecture section 12), with dependencies injected so it is
 * testable without expo-sqlite: open + migrate, seed, hydrate settings.
 */
import type { Repositories } from '../db/repositories';
import type { LocaleSettingsDefaults } from '../lib/locale';
import type { SettingsRepository } from '../db/repositories';
import { logger } from '../lib/logger';

export interface BootstrapDeps {
  /** Opens the database, migrates, and returns repositories. */
  getRepositories(): Promise<Repositories>;
  seed(repos: Repositories): Promise<unknown>;
  hydrateSettings(repo: SettingsRepository, defaults: LocaleSettingsDefaults): Promise<void>;
  localeDefaults(): LocaleSettingsDefaults;
}

export async function bootstrapApp(deps: BootstrapDeps): Promise<Repositories> {
  const started = Date.now();
  const repos = await deps.getRepositories();
  await deps.seed(repos);
  await deps.hydrateSettings(repos.settings, deps.localeDefaults());
  logger.info('startup.ready', { ms: Date.now() - started });
  return repos;
}
