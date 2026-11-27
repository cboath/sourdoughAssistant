import { useRouter } from 'expo-router';
import { CostScreen } from '../../../../src/features/cost/components/CostScreen';
import { routes } from '../../../../src/lib/nav';
import { routeParams } from '../../../../src/lib/route-params';
import { useRouteParams } from '../../../../src/lib/useRouteParams';
import { NotFoundView } from '../../../../src/ui/components/NotFoundView';

export default function RecipeCostRoute() {
  const router = useRouter();
  const result = useRouteParams(routeParams.recipe);
  if (!result.ok) return <NotFoundView onGoHome={() => router.replace(routes.recipes)} />;
  return <CostScreen id={result.params.id} loaves={result.params.loaves} />;
}
