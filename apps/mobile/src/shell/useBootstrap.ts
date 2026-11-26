import { useCallback, useEffect, useState } from 'react';
import type { Repositories } from '../db/repositories';
import { logger } from '../lib/logger';
import { bootstrapApp, type BootstrapDeps } from './bootstrap';

export type BootstrapState =
  | { status: 'loading' }
  | { status: 'ready'; repositories: Repositories }
  | { status: 'error'; error: Error };

export function useBootstrap(deps: BootstrapDeps) {
  const [state, setState] = useState<BootstrapState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    bootstrapApp(deps).then(
      (repositories) => {
        if (active) setState({ status: 'ready', repositories });
      },
      (error: unknown) => {
        logger.error('startup.failed', error);
        if (active)
          setState({
            status: 'error',
            error: error instanceof Error ? error : new Error('startup'),
          });
      },
    );
    return () => {
      active = false;
    };
    // `deps` is a module constant in production; a new attempt restarts the sequence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}
