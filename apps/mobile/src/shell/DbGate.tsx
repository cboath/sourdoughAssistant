import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import { RepositoriesProvider } from '../state/repositories';
import { useTheme } from '../ui/theme';
import type { BootstrapDeps } from './bootstrap';
import { StartupError } from './StartupError';
import { useBootstrap } from './useBootstrap';

export interface DbGateProps {
  deps: BootstrapDeps;
  /** Called once the gate has rendered its outcome (children or the retry screen): hide the splash. */
  onSettled?: () => void;
  children: ReactNode;
}

/**
 * Renders nothing (the native splash stays up) until the database is open, migrated, seeded and
 * settings are hydrated. Then renders children inside the repositories provider.
 */
export function DbGate({ deps, onSettled, children }: DbGateProps) {
  const { color } = useTheme();
  const { state, retry } = useBootstrap(deps);
  const settled = state.status !== 'loading';

  useEffect(() => {
    if (settled) onSettled?.();
  }, [settled, onSettled]);

  if (state.status === 'loading')
    return <View style={{ flex: 1, backgroundColor: color.background }} />;
  if (state.status === 'error') return <StartupError error={state.error} onRetry={retry} />;
  return <RepositoriesProvider repositories={state.repositories}>{children}</RepositoriesProvider>;
}
