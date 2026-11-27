import { useRouter } from 'expo-router';
import { RecipeEditorScreen } from '../../src/features/recipes/components/RecipeEditorScreen';
import { routeParams } from '../../src/lib/route-params';
import { useRouteParams } from '../../src/lib/useRouteParams';
import { NotFoundView } from '../../src/ui/components/NotFoundView';

// Params only select what to load (a recipe or a copy source); nothing is written on mount.
export default function RecipeEditorRoute() {
  const router = useRouter();
  const result = useRouteParams(routeParams.recipeEditor);
  if (!result.ok) return <NotFoundView onGoHome={() => router.replace('/bakes')} />;
  return <RecipeEditorScreen {...result.params} />;
}
