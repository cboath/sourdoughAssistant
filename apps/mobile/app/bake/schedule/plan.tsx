import { useRouter } from 'expo-router';
import { SchedulePlanScreen } from '../../../src/features/schedule/components/SchedulePlanScreen';
import { routes } from '../../../src/lib/nav';
import { routeParams } from '../../../src/lib/route-params';
import { useRouteParams } from '../../../src/lib/useRouteParams';
import { NotFoundView } from '../../../src/ui/components/NotFoundView';

// Params only prefill the draft; nothing is written on mount.
export default function SchedulePlanRoute() {
  const router = useRouter();
  const result = useRouteParams(routeParams.schedulePlan);
  if (!result.ok) return <NotFoundView onGoHome={() => router.replace(routes.bakes)} />;
  return <SchedulePlanScreen {...result.params} />;
}
