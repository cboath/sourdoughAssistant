import { useRouter } from 'expo-router';
import { LiveBakeScreen } from '../../../src/features/live/components/LiveBakeScreen';
import { routes } from '../../../src/lib/nav';
import { routeParams } from '../../../src/lib/route-params';
import { useRouteParams } from '../../../src/lib/useRouteParams';
import { NotFoundView } from '../../../src/ui/components/NotFoundView';

// BAKE-LIVE. `step` only focuses a step; nothing is written from params (SEC-01 M2).
export default function BakeLive() {
  const router = useRouter();
  const result = useRouteParams(routeParams.bake);
  if (!result.ok) return <NotFoundView onGoHome={() => router.replace(routes.bakes)} />;
  return <LiveBakeScreen id={result.params.id} step={result.params.step} />;
}
