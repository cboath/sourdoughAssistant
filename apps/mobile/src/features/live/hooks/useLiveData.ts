import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { AppState } from 'react-native';
import type { BakeAggregate } from '../../../db/types';
import { clock, useNow } from '../../../lib/clock';
import { logger } from '../../../lib/logger';
import { qk } from '../../../state/query-keys';
import { useRepositories } from '../../../state/repositories';
import { useBakeService } from '../../schedule/hooks/useScheduleData';
import { deriveBakeLive } from '../derive';

/** Scheduled and active bakes with their items and steps (the home list and the tab badge). */
export function useActiveBakes() {
  const { bakes } = useRepositories();
  return useQuery<BakeAggregate[]>({
    queryKey: qk.bakes.active(),
    queryFn: async () => {
      const headers = await bakes.list({ statuses: ['scheduled', 'active'] });
      const all = await Promise.all(headers.map((h) => bakes.get(h.id)));
      return all.filter((a): a is BakeAggregate => a !== null);
    },
  });
}

/** One bake in any status, or null when it does not exist (a stale notification). */
export function useLiveBake(id: string) {
  const { bakes } = useRepositories();
  return useQuery<BakeAggregate | null>({
    queryKey: qk.bakes.detail(id),
    queryFn: () => bakes.get(id),
  });
}

/** Number of current steps past their time across every open bake (Bakes tab badge). */
export function useOvertimeCount(): number {
  const { data } = useActiveBakes();
  const now = useNow(30_000);
  return useMemo(
    () => (data ?? []).reduce((sum, a) => sum + deriveBakeLive(a, now).overtimeCount, 0),
    [data, now],
  );
}

/**
 * Activates bakes whose first step is due and completes stale ones: once on mount and each time
 * the app returns to the foreground (architecture 9.1 Q-A4, Q-A10).
 */
export function useSweepBakes(): void {
  const service = useBakeService();
  useEffect(() => {
    const run = () => {
      service
        .sweep(clock.now())
        .catch((error: unknown) => logger.error('live.sweep_failed', error));
    };
    run();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    return () => subscription.remove();
  }, [service]);
}
