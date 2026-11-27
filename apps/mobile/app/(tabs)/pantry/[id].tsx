import { useRouter } from 'expo-router';
import { PantryDetailScreen } from '../../../src/features/pantry/components/PantryDetailScreen';
import { routes } from '../../../src/lib/nav';
import { routeParams } from '../../../src/lib/route-params';
import { useRouteParams } from '../../../src/lib/useRouteParams';
import { NotFoundView } from '../../../src/ui/components/NotFoundView';

export default function PantryDetailRoute() {
  const router = useRouter();
  const result = useRouteParams(routeParams.pantryItem);
  if (!result.ok) return <NotFoundView onGoHome={() => router.replace(routes.pantry)} />;
  return <PantryDetailScreen id={result.params.id} />;
}
