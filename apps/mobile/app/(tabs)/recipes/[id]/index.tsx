import { useRouter } from 'expo-router';
import { RecipeDetailScreen } from '../../../../src/features/recipes/components/RecipeDetailScreen';
import { routes } from '../../../../src/lib/nav';
import { routeParams } from '../../../../src/lib/route-params';
import { useRouteParams } from '../../../../src/lib/useRouteParams';
import { NotFoundView } from '../../../../src/ui/components/NotFoundView';

// `?loaves=` only sets the starting scale of the view; nothing is saved.
export default function RecipeDetailRoute() {
  const router = useRouter();
  const result = useRouteParams(routeParams.recipe);
  if (!result.ok) return <NotFoundView onGoHome={() => router.replace(routes.recipes)} />;
  return <RecipeDetailScreen id={result.params.id} loaves={result.params.loaves} />;
}
