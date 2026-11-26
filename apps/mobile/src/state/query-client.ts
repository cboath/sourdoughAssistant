/**
 * TanStack Query setup for local-only data (ADR 0002, SEC-01 L7d).
 * - `networkMode: 'always'`: local queries never pause for "offline".
 * - `staleTime: Infinity`: data changes only through our own mutations, which invalidate keys.
 * - No retries (local errors are not transient), no refetch on focus/reconnect, no persistence.
 */
import { AppState, type AppStateStatus } from 'react-native';
import { focusManager, QueryClient } from '@tanstack/react-query';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        networkMode: 'always',
        staleTime: Infinity,
        gcTime: 5 * 60 * 1000,
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
      mutations: { networkMode: 'always', retry: false },
    },
  });
}

/** Wires the focus manager to AppState (kept for v1.1 sync). Returns the unsubscribe. */
export function setupFocusManager(): () => void {
  const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
    focusManager.setFocused(status === 'active');
  });
  return () => sub.remove();
}
