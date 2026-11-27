import { useRouter } from 'expo-router';
import { IngredientEditorScreen } from '../../src/features/recipes/components/IngredientEditorScreen';
import { routeParams } from '../../src/lib/route-params';
import { useRouteParams } from '../../src/lib/useRouteParams';
import { NotFoundView } from '../../src/ui/components/NotFoundView';

export default function IngredientEditorRoute() {
  const router = useRouter();
  const result = useRouteParams(routeParams.ingredientEditor);
  if (!result.ok) return <NotFoundView onGoHome={() => router.replace('/bakes')} />;
  return <IngredientEditorScreen {...result.params} />;
}
