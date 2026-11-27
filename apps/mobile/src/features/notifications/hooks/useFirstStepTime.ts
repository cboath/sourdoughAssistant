import { useQuery } from '@tanstack/react-query';
import { useRepositories } from '../../../state/repositories';
import { clock } from '../../../lib/clock';
import { formatDayTime } from '../content';
import { notificationKeys } from '../keys';

/** "Sat 10:00 AM" for the bake's first step, for the primer's "Bake scheduled" banner. */
export function useFirstStepTime(bakeId: string): string | null {
  const repos = useRepositories();
  const query = useQuery({
    queryKey: notificationKeys.firstStep(bakeId),
    queryFn: async () => {
      const aggregate = await repos.bakes.get(bakeId);
      const starts = (aggregate?.steps ?? []).map((s) => Date.parse(s.plannedStartAt));
      return starts.length > 0 ? Math.min(...starts) : null;
    },
  });
  return query.data == null ? null : formatDayTime(query.data, clock.zone());
}
